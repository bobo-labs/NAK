import assert from 'node:assert/strict';
import test from 'node:test';

import { createPaymentIntent } from '../src/web3/intent.js';

test('payment intents are unique and bind a 32-byte question commitment', async () => {
  const before = BigInt(Date.now()) * 1_000_000n;
  const first = await createPaymentIntent('Will the conch answer?');
  const second = await createPaymentIntent('Will the conch answer?');
  const after = BigInt(Date.now()) * 1_000_000n;

  assert.equal(first.paymentId.length, 32);
  assert.equal(first.questionCommitment.length, 32);
  assert.notDeepEqual(first.paymentId, second.paymentId);
  assert.notDeepEqual(first.questionCommitment, second.questionCommitment);
  assert.ok(first.createdAtTime >= before && first.createdAtTime <= after);

  const expectedMemo = new DataView(
    first.questionCommitment.buffer,
    first.questionCommitment.byteOffset,
    first.questionCommitment.byteLength,
  ).getBigUint64(0, false);
  assert.equal(first.legacyMemo, expectedMemo);
});
