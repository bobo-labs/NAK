import { IcrcWallet } from '@dfinity/oisy-wallet-signer/icrc-wallet';
import { Principal } from '@icp-sdk/core/principal';

export function buildOisyTransferParams({ recipientOwner, paymentId, amount, memo, createdAtTime }) {
  return {
    to: {
      owner: Principal.fromText(recipientOwner),
      // The generated ICRC Candid type represents an optional subaccount as
      // [] | [Uint8Array]. Passing the byte array directly is encoded as a
      // record with numeric keys by the signer and is rejected before sending.
      subaccount: [paymentId],
    },
    amount,
    memo,
    created_at_time: createdAtTime,
  };
}

export class OisyWalletAdapter {
  #account;
  #connectSigner;
  #dismissDisconnect;
  #signerOptions;
  #wallet;

  constructor({ connectSigner = options => IcrcWallet.connect(options) } = {}) {
    this.#connectSigner = connectSigner;
  }

  async #closeSigner() {
    this.#dismissDisconnect?.();
    this.#dismissDisconnect = undefined;
    const wallet = this.#wallet;
    this.#wallet = undefined;
    if (wallet) {
      try {
        await wallet.disconnect();
      } catch (error) {
        console.warn('OISY signer cleanup failed:', error);
      }
    }
  }

  async #openSigner() {
    if (!this.#signerOptions) {
      throw new Error('Connect OISY before making a payment.');
    }

    let wallet;
    let rejectDisconnected;
    let sessionActive = true;
    const disconnected = new Promise((_, reject) => {
      rejectDisconnected = reject;
    });
    // A close can happen between account discovery and the transfer race.
    // Attach a handler immediately while preserving the rejected promise.
    disconnected.catch(() => {});
    this.#dismissDisconnect = () => {
      sessionActive = false;
    };

    try {
      wallet = await this.#connectSigner({
        ...this.#signerOptions,
        onDisconnect: () => {
          if (this.#wallet === wallet) {
            this.#wallet = undefined;
          }
          if (sessionActive) {
            sessionActive = false;
            rejectDisconnected(new Error('OISY approval was closed. No payment was sent; your wallet remains linked.'));
          }
        },
      });
      this.#wallet = wallet;

      const { allPermissionsGranted } = await Promise.race([
        wallet.requestPermissionsNotGranted(),
        disconnected,
      ]);
      if (!allPermissionsGranted) {
        throw new Error('OISY permissions are required to make the oracle payment.');
      }

      const accounts = await Promise.race([wallet.accounts(), disconnected]);
      const account = accounts[0];
      if (!account) {
        throw new Error('OISY did not return an ICP account.');
      }

      return { account, disconnected, wallet };
    } catch (error) {
      await this.#closeSigner();
      throw error;
    }
  }

  async connect({ signerUrl, host }) {
    await this.disconnect();
    this.#signerOptions = {
      url: signerUrl,
      host,
      windowOptions: { width: 576, height: 625, position: 'center' },
      connectionOptions: { timeoutInMilliseconds: 120_000 },
    };

    try {
      const { account } = await this.#openSigner();
      this.#account = account;
      return { principal: account.owner, type: 'oisy' };
    } catch (error) {
      this.#account = undefined;
      this.#signerOptions = undefined;
      throw error;
    } finally {
      await this.#closeSigner();
    }
  }

  async transfer({ ledgerCanisterId, recipientOwner, paymentId, amount, memo, createdAtTime }) {
    if (!this.#account || !this.#signerOptions) {
      throw new Error('Connect OISY before making a payment.');
    }

    try {
      const { account, disconnected, wallet } = await this.#openSigner();
      if (account.owner !== this.#account.owner) {
        throw new Error('OISY opened a different account. Disconnect it and link the intended account.');
      }

      return await Promise.race([
        wallet.transfer({
          owner: account.owner,
          ledgerCanisterId,
          params: buildOisyTransferParams({
            recipientOwner,
            paymentId,
            amount,
            memo,
            createdAtTime,
          }),
        }),
        disconnected,
      ]);
    } finally {
      await this.#closeSigner();
    }
  }

  async disconnect() {
    this.#account = undefined;
    this.#signerOptions = undefined;
    await this.#closeSigner();
  }
}
