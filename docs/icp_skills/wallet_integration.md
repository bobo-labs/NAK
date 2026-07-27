# Wallet Integration Specification & Guidelines (ICRC-21/25/27/29/49)

> **Source:** DFINITY Internet Computer Official Skills (`https://skills.internetcomputer.org/skills/wallet-integration/`)

## 1. Overview & Signer Model

Wallet integration on the Internet Computer uses the ICRC signer standards — a popup-based model where every action requires explicit user approval via JSON-RPC 2.0 over `window.postMessage`.

The signer model requires explicit per-action approval. `connect()` establishes a communication channel between the dApp (Relying Party) and the wallet signer.

### ICRC Standards Implemented:
- **ICRC-21**: Canister call consent messages
- **ICRC-25**: Signer interaction standard (permissions lifecycle)
- **ICRC-27**: Accounts retrieval
- **ICRC-29**: Window PostMessage transport
- **ICRC-49**: Call canister execution

---

## 2. Oisy Wallet Integration Guide

Implementation uses `@dfinity/oisy-wallet-signer`.

### Entry Point Imports
> **CRITICAL PITFALL**: `Signer`, `RelyingParty`, `IcpWallet`, and `IcrcWallet` are **not** exported from the root `@dfinity/oisy-wallet-signer` package. You must import them from their dedicated subpaths:

```javascript
// CORRECT IMPORTS
import { Signer } from '@dfinity/oisy-wallet-signer/signer';
import { IcpWallet } from '@dfinity/oisy-wallet-signer/icp-wallet';
import { IcrcWallet } from '@dfinity/oisy-wallet-signer/icrc-wallet';
```

### Connection & Permission Flow
```javascript
// 1. Establish channel
const wallet = await IcpWallet.connect({
  url: 'https://oisy.com'
});

// 2. Request permissions upfront (prevents per-method popup fatigue)
await wallet.requestPermissionsNotGranted();

// 3. Get accounts
const accounts = await wallet.accounts();
const userAccount = accounts[0]; // { owner: Principal, subaccount?: Uint8Array }
```

### ICP Transfer Approval Flow
```javascript
const blockIndex = await wallet.transfer({
  to: { owner: Principal.fromText(ORACLE_TREASURY_PRINCIPAL) },
  amount: 1_000_000n, // 0.01 ICP in e8s (BigInt)
  ledgerCanisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai' // Required!
});
```

---

## 3. Plug Wallet Integration Guide

Plug provides the `window.ic.plug` provider.

### Connection & Whitelist Setup
```javascript
const whitelist = ['ryjl3-tyaaa-aaaaa-aaaba-cai', BACKEND_CANISTER_ID];
const host = 'https://icp-api.io';

const connected = await window.ic.plug.requestConnect({
  whitelist,
  host
});

if (connected) {
  const principalId = window.ic.plug.sessionManager.sessionData.principalId;
  const balance = await window.ic.plug.requestBalance();
}
```

### Transfer Execution
```javascript
const transferOpts = {
  to: ORACLE_TREASURY_ACCOUNT_ID_OR_PRINCIPAL,
  amount: 1_000_000, // 0.01 ICP in e8s
  opts: {
    fee: 10_000 // Standard ICP ledger transaction fee (0.0001 ICP)
  }
};

const result = await window.ic.plug.requestTransfer(transferOpts);
// result.height contains the ledger block index
```

---

## 4. Key Pitfalls & Solutions

1. **`connect()` is not an authenticated session**: `connect()` only opens a `postMessage` channel. Always call `requestPermissionsNotGranted()` after connecting.
2. **Missing `ledgerCanisterId` in `IcrcWallet`**: Unlike `IcpWallet` (which defaults to ICP ledger), `IcrcWallet` requires `ledgerCanisterId`.
3. **Concurrent Requests**: The signer processes one request at a time. Serialize calls and wait for responses before sending subsequent requests.
