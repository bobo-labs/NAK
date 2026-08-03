import { AccountIdentifier, SubAccount } from '@icp-sdk/canisters/ledger/icp';
import { Principal } from '@icp-sdk/core/principal';

export class PlugWalletAdapter {
  #plug;

  async connect({ host, ledgerCanisterId, backendCanisterId }) {
    this.#plug = window.ic?.plug;
    if (!this.#plug) {
      throw new Error('Plug Wallet is not installed in this browser.');
    }

    const connected = await this.#plug.requestConnect({
      whitelist: [ledgerCanisterId, backendCanisterId],
      host,
    });
    if (!connected) {
      throw new Error('Plug Wallet connection was not approved.');
    }

    const principal = this.#plug.sessionManager?.sessionData?.principalId;
    if (!principal) {
      throw new Error('Plug Wallet did not return a principal.');
    }
    return { principal, type: 'plug' };
  }

  async transfer({ recipientOwner, paymentId, amount, fee, legacyMemo }) {
    if (!this.#plug) {
      throw new Error('Connect Plug before making a payment.');
    }

    const to = AccountIdentifier.fromPrincipal({
      principal: Principal.fromText(recipientOwner),
      subAccount: SubAccount.fromBytes(paymentId),
    }).toHex();

    const result = await this.#plug.requestTransfer({
      to,
      amount: Number(amount),
      opts: {
        fee: Number(fee),
        memo: legacyMemo.toString(),
      },
    });
    return BigInt(result.height);
  }

  async disconnect() {
    const plug = this.#plug;
    this.#plug = undefined;
    if (plug?.disconnect) {
      await plug.disconnect();
    }
  }
}
