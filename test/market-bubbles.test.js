import assert from 'node:assert/strict';
import test from 'node:test';

import { selectIcpTokenMovers } from '../src/market/bubbles.js';

function mover(symbol, change, overrides = {}) {
  return {
    symbol,
    canister_id: `${symbol.toLowerCase()}-canister`,
    logo: `${symbol.toLowerCase()}.png`,
    change_pct: change,
    ...overrides,
  };
}

test('ICP Tokens bubbles contain three gainers, three losers, and the live NAK promo', () => {
  const payload = {
    data: {
      gainers: [
        mover('NAK', 25, { canister_id: 'nak-canister' }),
        mover('ONE', 20), mover('TWO', 5), mover('THREE', 3),
      ],
      losers: [mover('DOWN1', -20), mover('DOWN2', -5), mover('DOWN3', -3)],
    },
  };
  const promoToken = {
    symbol: 'NAK',
    canister_id: 'nak-canister',
    logo: 'nak.jpg',
    metrics: { change: { '24h': { usd: -1.2 } } },
  };

  const { bubbles, promo } = selectIcpTokenMovers(payload, promoToken, 'nak-canister');

  assert.deepEqual(bubbles.map(token => token.symbol), ['ONE', 'TWO', 'THREE', 'DOWN1', 'DOWN2', 'DOWN3']);
  assert.ok(bubbles.every(token => token.logo.startsWith('https://icptokens.net/storage/')));
  assert.equal(promo.symbol, 'NAK');
  assert.equal(promo.change, -1.2);
  assert.equal(promo.logo, 'https://icptokens.net/storage/nak.jpg');
});
