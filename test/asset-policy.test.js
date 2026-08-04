import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const assetPolicyUrl = new URL('../public/.ic-assets.json5', import.meta.url);

test('asset policy permits embedded GLB textures without enabling raw access', async () => {
  const rules = JSON.parse(await readFile(assetPolicyUrl, 'utf8'));
  const defaultRule = rules.find(rule => rule.match === '**/*' && rule.security_policy);

  assert.ok(defaultRule);
  assert.equal(defaultRule.allow_raw_access, false);
  assert.match(defaultRule.headers['Content-Security-Policy'], /connect-src[^;]*\bblob:/);
  assert.match(defaultRule.headers['Content-Security-Policy'], /img-src[^;]*\bblob:/);
  assert.match(defaultRule.headers['Content-Security-Policy'], /img-src[^;]*https:\/\/icptokens\.net/);
  assert.doesNotMatch(defaultRule.headers['Content-Security-Policy'], /geckoterminal/i);
  assert.match(defaultRule.headers['Content-Security-Policy'], /media-src\s+'self'/);
});
