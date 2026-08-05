import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOisyTransferParams, OisyWalletAdapter } from '../src/web3/wallets/oisy.js';

test('OISY encodes the payment subaccount as an optional ICRC byte vector', () => {
  const paymentId = Uint8Array.from({ length: 32 }, (_, index) => index);
  const memo = Uint8Array.from([1, 2, 3]);
  const createdAtTime = 1_723_000_000_000_000_000n;

  const params = buildOisyTransferParams({
    recipientOwner: 'dal4e-uyaaa-aaaad-qmbza-cai',
    paymentId,
    amount: 1_000_000n,
    memo,
    createdAtTime,
  });

  assert.equal(params.to.owner.toText(), 'dal4e-uyaaa-aaaad-qmbza-cai');
  assert.deepEqual(params.to.subaccount, [paymentId]);
  assert.equal(params.amount, 1_000_000n);
  assert.equal(params.memo, memo);
  assert.equal(params.created_at_time, createdAtTime);
});

function fakeSignerSession({ owner = '7nxlb-7aaaa-aaaak-afzsq-cai', blockIndex = 854_008n } = {}) {
  const calls = [];
  return {
    calls,
    wallet: {
      async requestPermissionsNotGranted() {
        calls.push('permissions');
        return { allPermissionsGranted: true };
      },
      async accounts() {
        calls.push('accounts');
        return [{ owner }];
      },
      async transfer(request) {
        calls.push(['transfer', request]);
        return blockIndex;
      },
      async disconnect() {
        calls.push('disconnect');
      },
    },
  };
}

test('OISY closes its signer after linking and reopens it only for a transfer', async () => {
  const linkSession = fakeSignerSession();
  const paymentSession = fakeSignerSession();
  const sessions = [linkSession, paymentSession];
  const adapter = new OisyWalletAdapter({
    connectSigner: async () => sessions.shift().wallet,
  });

  const connection = await adapter.connect({
    signerUrl: 'https://staging.signer.oisy.com',
    host: 'https://icp-api.io',
  });
  assert.equal(connection.principal, '7nxlb-7aaaa-aaaak-afzsq-cai');
  assert.deepEqual(linkSession.calls, ['permissions', 'accounts', 'disconnect']);

  const paymentId = Uint8Array.from({ length: 32 }, (_, index) => index);
  const blockIndex = await adapter.transfer({
    ledgerCanisterId: 'xafvr-biaaa-aaaai-aql5q-cai',
    recipientOwner: 'dal4e-uyaaa-aaaad-qmbza-cai',
    paymentId,
    amount: 1_000_000n,
    memo: Uint8Array.from([4, 5, 6]),
    createdAtTime: 1_723_000_000_000_000_000n,
  });

  assert.equal(blockIndex, 854_008n);
  assert.equal(paymentSession.calls[0], 'permissions');
  assert.equal(paymentSession.calls[1], 'accounts');
  assert.equal(paymentSession.calls[2][0], 'transfer');
  assert.deepEqual(paymentSession.calls[2][1].params.to.subaccount, [paymentId]);
  assert.equal(paymentSession.calls[3], 'disconnect');
});

test('OISY refuses a payment if the reopened signer returns a different account', async () => {
  const linkSession = fakeSignerSession();
  const paymentSession = fakeSignerSession({ owner: 'aaaaa-aa' });
  const sessions = [linkSession, paymentSession];
  const adapter = new OisyWalletAdapter({
    connectSigner: async () => sessions.shift().wallet,
  });

  await adapter.connect({
    signerUrl: 'https://staging.signer.oisy.com',
    host: 'https://icp-api.io',
  });

  await assert.rejects(
    adapter.transfer({
      ledgerCanisterId: 'xafvr-biaaa-aaaai-aql5q-cai',
      recipientOwner: 'dal4e-uyaaa-aaaad-qmbza-cai',
      paymentId: new Uint8Array(32),
      amount: 1_000_000n,
      memo: new Uint8Array(32),
      createdAtTime: 1_723_000_000_000_000_000n,
    }),
    /different account/,
  );
  assert.deepEqual(paymentSession.calls, ['permissions', 'accounts', 'disconnect']);
});

test('closing an OISY payment popup cancels the request but keeps the account linked', async () => {
  const linkSession = fakeSignerSession();
  const canceledSession = fakeSignerSession();
  const retrySession = fakeSignerSession({ blockIndex: 854_009n });
  canceledSession.wallet.transfer = async request => {
    canceledSession.calls.push(['transfer', request]);
    return new Promise(() => {});
  };

  const sessions = [linkSession, canceledSession, retrySession];
  const disconnectCallbacks = [];
  const adapter = new OisyWalletAdapter({
    connectSigner: async options => {
      disconnectCallbacks.push(options.onDisconnect);
      return sessions.shift().wallet;
    },
  });
  const transferRequest = {
    ledgerCanisterId: 'xafvr-biaaa-aaaai-aql5q-cai',
    recipientOwner: 'dal4e-uyaaa-aaaad-qmbza-cai',
    paymentId: new Uint8Array(32),
    amount: 1_000_000n,
    memo: new Uint8Array(32),
    createdAtTime: 1_723_000_000_000_000_000n,
  };

  await adapter.connect({
    signerUrl: 'https://staging.signer.oisy.com',
    host: 'https://icp-api.io',
  });

  const canceledTransfer = adapter.transfer(transferRequest);
  await new Promise(resolve => setImmediate(resolve));
  disconnectCallbacks[1]();
  await assert.rejects(canceledTransfer, /wallet remains linked/);

  assert.equal(await adapter.transfer(transferRequest), 854_009n);
  assert.equal(retrySession.calls[2][0], 'transfer');
});
