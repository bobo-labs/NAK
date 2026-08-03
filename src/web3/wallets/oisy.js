import { IcrcWallet } from '@dfinity/oisy-wallet-signer/icrc-wallet';
import { Principal } from '@icp-sdk/core/principal';

export class OisyWalletAdapter {
  #account;
  #wallet;

  async connect({ signerUrl, host, onDisconnect }) {
    this.#wallet = await IcrcWallet.connect({
      url: signerUrl,
      host,
      windowOptions: { width: 576, height: 625, position: 'center' },
      connectionOptions: { timeoutInMilliseconds: 120_000 },
      onDisconnect,
    });

    const { allPermissionsGranted } = await this.#wallet.requestPermissionsNotGranted();
    if (!allPermissionsGranted) {
      await this.disconnect();
      throw new Error('OISY permissions are required to make the oracle payment.');
    }

    const accounts = await this.#wallet.accounts();
    this.#account = accounts[0];
    if (!this.#account) {
      await this.disconnect();
      throw new Error('OISY did not return an ICP account.');
    }

    return { principal: this.#account.owner, type: 'oisy' };
  }

  async transfer({ ledgerCanisterId, recipientOwner, paymentId, amount, memo, createdAtTime }) {
    if (!this.#wallet || !this.#account) {
      throw new Error('Connect OISY before making a payment.');
    }

    return this.#wallet.transfer({
      owner: this.#account.owner,
      ledgerCanisterId,
      params: {
        to: {
          owner: Principal.fromText(recipientOwner),
          subaccount: paymentId,
        },
        amount,
        memo,
        created_at_time: createdAtTime,
      },
    });
  }

  async disconnect() {
    const wallet = this.#wallet;
    this.#wallet = undefined;
    this.#account = undefined;
    if (wallet) {
      await wallet.disconnect();
    }
  }
}
