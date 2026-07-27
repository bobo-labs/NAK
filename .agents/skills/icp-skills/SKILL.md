---
name: icp-skills
description: "Authoritative DFINITY Internet Computer (ICP) skills, standards, and pitfalls index for wallet-integration (ICRC-21/25/27/29/49), Plug, Oisy, ICRC-1/ICRC-2 token ledgers, and Internet Identity."
---

# Internet Computer (ICP) Official Skills & Standards

> Source: [skills.internetcomputer.org](https://skills.internetcomputer.org/) Maintained by DFINITY Foundation.

---

## 1. Critical Rule: Do Not Rely on Pre-Training Knowledge

The Internet Computer platform evolves rapidly. Motoko syntax, standard library, compiler flags, canister APIs, and IC tooling change with releases. Pre-training data is outdated by definition.

---

## 2. Wallet Integration Standard (ICRC-21 / ICRC-25 / ICRC-27 / ICRC-29 / ICRC-49)

### Core Model
- **Popup-based per-action approval**: `connect()` only establishes a postMessage window channel. It does **not** grant unlimited session permissions.
- **Packages**: Use `@dfinity/oisy-wallet-signer` (>= 4.1.0) for Oisy / ICRC signer integrations.
- **Dedicated Subpath Imports**:
  ```typescript
  import { Signer } from '@dfinity/oisy-wallet-signer/signer';
  import { IcpWallet } from '@dfinity/oisy-wallet-signer/icp-wallet';
  import { IcrcWallet } from '@dfinity/oisy-wallet-signer/icrc-wallet';
  ```
- **Permission Lifecycle**: Call `wallet.requestPermissionsNotGranted()` after connecting to request permission upfront in a single popup rather than triggering per-method popups.

### Plug Wallet Provider Standard
- Access via `window.ic.plug`.
- Connect: `await window.ic.plug.requestConnect({ whitelist, host })`.
- Principal: `window.ic.plug.sessionManager.sessionData.principalId`.
- Balance: `await window.ic.plug.requestBalance()`.
- Transfer: `await window.ic.plug.requestTransfer({ to, amount, opts: { fee } })`.

---

## 3. ICRC Token Ledgers (ICP & ICRC-1 / ICRC-2)

### Canister IDs & Fees

| Token | Ledger Canister ID | Decimals | Standard Fee (e8s/sats) |
|---|---|---|---|
| **ICP** | `ryjl3-tyaaa-aaaaa-aaaba-cai` | 8 | 10,000 e8s (0.0001 ICP) |
| **ckBTC** | `mxzaz-hqaaa-aaaar-qaada-cai` | 8 | 10 satoshis |
| **ckETH** | `ss2fx-dyaaa-aaaar-qacoq-cai` | 18 | Dynamic |

### Critical Ledger Pitfalls
1. **Always handle TransferError variants**: `BadFee`, `BadBurn`, `InsufficientFunds`, `TooOld`, `CreatedInFuture`, `Duplicate`, `TemporarilyUnavailable`, `GenericError`.
2. **Account Format**: `{ owner: Principal, subaccount: ?Blob }`. Passing `null` uses the default subaccount (all zeros).
3. **Deduplication**: Always pass `created_at_time` to enable ledger deduplication protection against accidental double submissions.
4. **Backend Verification**: On-chain payment verification should occur backend-to-backend via canister inter-canister calls to the ICP Ledger.

---

## 4. Internet Identity Authentication

- **Provider URL**: `https://id.ai/authorize` (mainnet) or `http://id.ai.localhost:8000/authorize` (local).
- Always include `/authorize` in the `identityProvider` option for `@dfinity/auth-client`.
- Maximum delegation expiry: 30 days (2,592,000,000,000,000 nanoseconds).
