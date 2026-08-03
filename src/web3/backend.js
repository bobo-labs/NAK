import { safeGetCanisterEnv } from '@icp-sdk/core/agent/canister-env';

import { createActor } from '../bindings/backend';

let cachedContext;

export class IcpBackendUnavailableError extends Error {
  constructor() {
    super('The ICP backend is not deployed for this environment.');
    this.name = 'IcpBackendUnavailableError';
  }
}

export function getBackendContext() {
  const canisterEnv = safeGetCanisterEnv();
  const canisterId = canisterEnv?.['PUBLIC_CANISTER_ID:backend'];
  if (!canisterId) {
    throw new IcpBackendUnavailableError();
  }

  if (cachedContext?.canisterId === canisterId) {
    return cachedContext;
  }

  const agentOptions = {
    host: window.location.origin,
    rootKey: canisterEnv?.IC_ROOT_KEY,
  };

  cachedContext = {
    canisterId,
    actor: createActor(canisterId, { agentOptions }),
  };
  return cachedContext;
}
