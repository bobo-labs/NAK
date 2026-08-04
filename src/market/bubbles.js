const EXCLUDED_SYMBOLS = new Set(['ICP', 'USDT', 'USDC', 'CKUSDT', 'CKUSDC']);

function normalizedSymbol(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function tokenLogoUrl(filename) {
  return typeof filename === 'string' && filename.trim()
    ? `https://icptokens.net/storage/${encodeURIComponent(filename)}`
    : null;
}

function mapIcpTokensMover(token, isGainer, promoCanisterId) {
  const symbol = normalizedSymbol(token?.symbol);
  const change = finiteNumber(token?.change_pct);
  if (
    token?.canister_id === promoCanisterId ||
    !symbol ||
    EXCLUDED_SYMBOLS.has(symbol) ||
    change === null ||
    typeof token?.canister_id !== 'string'
  ) {
    return null;
  }

  return {
    symbol,
    logo: tokenLogoUrl(token.logo),
    change,
    isGainer,
    url: `https://icptokens.net/token/${encodeURIComponent(token.canister_id)}`,
  };
}

export function selectIcpTokenMovers(payload, promoToken, promoCanisterId) {
  const gainers = payload?.data?.gainers;
  const losers = payload?.data?.losers;
  if (!Array.isArray(gainers) || !Array.isArray(losers)) {
    throw new Error('ICP Tokens response does not contain gainers and losers.');
  }

  const selectedGainers = gainers
    .map(token => mapIcpTokensMover(token, true, promoCanisterId))
    .filter(Boolean)
    .slice(0, 3);
  const selectedLosers = losers
    .map(token => mapIcpTokensMover(token, false, promoCanisterId))
    .filter(Boolean)
    .slice(0, 3);

  if (selectedGainers.length < 3 || selectedLosers.length < 3) {
    throw new Error('ICP Tokens response does not contain three gainers and three losers.');
  }

  const promoChange = finiteNumber(promoToken?.metrics?.change?.['24h']?.usd);
  const promo = promoToken?.canister_id === promoCanisterId && promoChange !== null
    ? {
        symbol: normalizedSymbol(promoToken.symbol) || 'NAK',
        logo: tokenLogoUrl(promoToken.logo),
        change: promoChange,
      }
    : null;

  return { bubbles: [...selectedGainers, ...selectedLosers], promo };
}
