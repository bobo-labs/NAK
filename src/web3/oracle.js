import { getBackendContext } from './backend.js';
import { createPaymentIntent } from './intent.js';
import { OisyWalletAdapter } from './wallets/oisy.js';
import { PlugWalletAdapter } from './wallets/plug.js';

const IC_HOST = 'https://icp-api.io';
const OISY_SIGNERS = {
  staging: 'https://staging.signer.oisy.com',
  production: 'https://signer.oisy.com',
};

let activeAdapter;
let activeConfig;
let activeConnection;

function unwrapConfig(result) {
  if ('err' in result) {
    throw new Error(result.err);
  }
  const config = result.ok;
  return {
    ...config,
    ledgerCanisterId: config.ledgerCanisterId.toText(),
    indexCanisterId: config.indexCanisterId.toText(),
  };
}

async function loadConfig() {
  const { actor, canisterId } = getBackendContext();
  const config = unwrapConfig(await actor.getConfig());
  return { actor, canisterId, config };
}

function isRetryable(error) {
  return 'paymentNotIndexed' in error || 'busy' in error || 'upstream' in error;
}

function describeSettlementError(error) {
  if ('invalidInput' in error) return error.invalidInput;
  if ('configuration' in error) return error.configuration;
  if ('amountMismatch' in error) {
    return `Payment amount mismatch: expected ${error.amountMismatch.expected}, received ${error.amountMismatch.received}.`;
  }
  if ('blockAlreadyClaimed' in error) return 'That ledger block was already used for another prompt.';
  if ('recipientMismatch' in error) return 'The payment recipient did not match this oracle.';
  if ('memoMismatch' in error) return 'The payment memo did not match this prompt.';
  if ('upstream' in error) return error.upstream;
  return 'The payment is still being verified.';
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function settleWithRetry(actor, request) {
  let wait = 1_000;
  let lastError;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await actor.settlePayment(request);
    if ('ok' in result) {
      return result.ok;
    }

    lastError = result.err;
    if (!isRetryable(lastError)) {
      throw new Error(describeSettlementError(lastError));
    }
    await delay(wait);
    wait = Math.min(Math.round(wait * 1.5), 5_000);
  }

  throw new Error(describeSettlementError(lastError));
}

export async function connectWallet(type, onDisconnect) {
  const { canisterId, config } = await loadConfig();

  if (type === 'plug' && config.network !== 'production') {
    throw new Error('Use OISY for TESTICP staging. Plug is enabled for the production ICP ledger.');
  }

  await disconnectWallet();

  const adapter = type === 'oisy' ? new OisyWalletAdapter() : new PlugWalletAdapter();
  let connection;
  try {
    connection = await adapter.connect({
      signerUrl: OISY_SIGNERS[config.network] ?? OISY_SIGNERS.staging,
      host: IC_HOST,
      ledgerCanisterId: config.ledgerCanisterId,
      backendCanisterId: canisterId,
      onDisconnect,
    });
  } catch (error) {
    await adapter.disconnect();
    throw error;
  }

  activeAdapter = adapter;
  activeConfig = config;
  activeConnection = connection;
  return { ...connection, config };
}

export async function disconnectWallet() {
  const adapter = activeAdapter;
  activeAdapter = undefined;
  activeConfig = undefined;
  activeConnection = undefined;
  if (adapter) {
    await adapter.disconnect();
  }
}

export async function purchaseOracleAnswer(question) {
  if (!activeAdapter || !activeConnection || !activeConfig) {
    throw new Error('Connect a wallet before paying for an oracle prompt.');
  }

  const { actor, canisterId, config } = await loadConfig();
  if (config.ledgerCanisterId !== activeConfig.ledgerCanisterId) {
    throw new Error('The active wallet is connected to a different ledger configuration.');
  }

  const intent = await createPaymentIntent(question);
  const blockIndex = await activeAdapter.transfer({
    ledgerCanisterId: config.ledgerCanisterId,
    recipientOwner: canisterId,
    paymentId: intent.paymentId,
    amount: config.amount,
    fee: config.fee,
    memo: intent.questionCommitment,
    legacyMemo: intent.legacyMemo,
    createdAtTime: intent.createdAtTime,
  });

  const receipt = await settleWithRetry(actor, {
    blockIndex,
    paymentId: intent.paymentId,
    questionCommitment: intent.questionCommitment,
    legacyMemo: intent.legacyMemo,
  });

  return {
    answerId: receipt.answerId,
    blockIndex: receipt.blockIndex,
    amount: receipt.amount,
    tokenSymbol: receipt.tokenSymbol,
  };
}
