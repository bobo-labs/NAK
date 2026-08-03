const encoder = new TextEncoder();
const DOMAIN = encoder.encode('NAK_MAGIC_CONCH_ORACLE_V1');

function concatenate(...arrays) {
  const result = new Uint8Array(arrays.reduce((size, value) => size + value.length, 0));
  let offset = 0;
  for (const value of arrays) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

export async function createPaymentIntent(question) {
  const paymentId = crypto.getRandomValues(new Uint8Array(32));
  const questionBytes = encoder.encode(question);
  const commitmentInput = concatenate(DOMAIN, new Uint8Array([0]), paymentId, questionBytes);
  const questionCommitment = new Uint8Array(await crypto.subtle.digest('SHA-256', commitmentInput));
  const legacyMemo = new DataView(
    questionCommitment.buffer,
    questionCommitment.byteOffset,
    questionCommitment.byteLength,
  ).getBigUint64(0, false);

  return {
    paymentId,
    questionCommitment,
    legacyMemo,
    createdAtTime: BigInt(Date.now()) * 1_000_000n,
  };
}
