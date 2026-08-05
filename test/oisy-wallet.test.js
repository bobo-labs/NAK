import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOisyTransferParams } from '../src/web3/wallets/oisy.js';

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
