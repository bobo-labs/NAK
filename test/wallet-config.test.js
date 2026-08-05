import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const oracleUrl = new URL('../src/web3/oracle.js', import.meta.url);

test('OISY uses the current standalone signer domains', async () => {
  const source = await readFile(oracleUrl, 'utf8');

  assert.match(source, /staging:\s*'https:\/\/staging\.signer\.oisy\.com'/);
  assert.match(source, /production:\s*'https:\/\/signer\.oisy\.com'/);
  assert.doesNotMatch(source, /https:\/\/(?:staging\.)?oisy\.com\/sign/);
});

test('wallet orchestration exposes an explicit disconnect operation', async () => {
  const source = await readFile(oracleUrl, 'utf8');

  assert.match(source, /export async function disconnectWallet\(\)/);
  assert.match(source, /activeConnection = undefined/);
});
