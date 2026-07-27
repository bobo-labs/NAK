# ICP Web3 & Backend Integration Plan — Bobo Labs NAK MVP

> **Document Version:** 1.0.0  
> **Target Platform:** Internet Computer (ICP)  
> **Wallets Supported:** Plug Wallet, Oisy Wallet, Internet Identity  
> **Compliance Source:** [DFINITY Official ICP Skills](https://skills.internetcomputer.org/llms.txt) & `wallet-integration` specification (ICRC-21/25/27/29/49)

---

## 1. Executive Summary

This document details the complete production implementation plan for integrating live Web3 wallet authentication, on-chain ICP token burn/transfer transactions, transaction verification, and frontend animation/audio synchronization into the **NAK MVP 3D Conch Portal**.

The implementation connects the existing frontend UI components (`#wallet-connect-wrapper`, `.ask-conch-overlay`, and `.conch-card`) to mainnet ICP canisters and Web3 wallet providers (**Plug Wallet**, **Oisy Wallet**, and **Internet Identity**).

---

## 2. ICP Standards & Authoritative Skill Directives

Per [skills.internetcomputer.org/llms.txt](https://skills.internetcomputer.org/llms.txt), pre-training knowledge for Internet Computer SDKs is frequently outdated. This plan adheres strictly to the latest official DFINITY specifications:

| Component | Standard / Package | Purpose |
|---|---|---|
| **ICP Ledger Canister** | `ryjl3-tyaaa-aaaaa-aaaba-cai` | Mainnet ICP token transfers and balance queries |
| **ICRC Signer Standard** | ICRC-25 (Permissions), ICRC-27 (Accounts), ICRC-21 (Consent Messages), ICRC-49 (Call Canister) | Standardized popup-based transaction approval |
| **Oisy Wallet Integration** | `@dfinity/oisy-wallet-signer/icp-wallet` (>= 4.1.0) | Popup-based Oisy wallet connection & ICRC transfer signing |
| **Plug Wallet Integration** | `window.ic.plug` (Plug Provider API) | Browser extension wallet connection, principal retrieval, and `requestTransfer` |
| **Internet Identity Auth** | `@dfinity/auth-client` (>= 0.24.0) | Passkey / II delegation identity authentication |
| **ICP SDK & Agents** | `@dfinity/agent`, `@dfinity/principal`, `@dfinity/ledger-icp` | HttpAgent construction, principal parsing, and ledger interaction |

---

## 3. End-to-End System Sequence & User Flow

```
[ User ]              [ Frontend UI ]              [ Connected Wallet ]            [ ICP Mainnet Ledger / Canister ]
   |                         |                              |                                       |
   |--- 1. Connect Wallet -->|                              |                                       |
   |    Selects Provider     |--- Connect Request --------->|                                       |
   |    (Plug/Oisy/II)       |<-- Returns Principal & Bal.---|                                       |
   |                         | (Updates Top HUD Bar)        |                                       |
   |                         |                              |                                       |
   |--- 2. Select Question ->|                              |                                       |
   |    (Ask the Conch)      | Enables "BURN 0.01 ICP"      |                                       |
   |                         |                              |                                       |
   |--- 3. Click "BURN" ---->|                              |                                       |
   |                         |--- Initiate Transfer Request->|                                       |
   |                         |    (0.01 ICP + Fee)          |--- Displays Approval Dialog --------->|
   |                         |                              |<-- User Approves Signature/Tx --------|
   |<-- Returns Block Index -|                              |                                       |
   |                         |                                                                      |
   |                         |--- 4. Verify Transaction -------------------------------------------->|
   |                         |    (Queries Ledger / Verification Canister with Block Index & Query) |
   |                         |<-- Returns Verification Success (Tx Verified) -----------------------|
   |                         |                                                                      |
   |                         |--- 5. State Transition ---------------------------------------------->|
   |                         |    - Card updates to "THE ORACLE SPEAKS"                             |
   |                         |    - Unlocks "PULL THE CORD" button                                  |
   |                         |                                                                      |
   |--- 6. Click "PULL" ---->|                                                                      |
   |                         |--- Starts 3D Cord Pull Animation                                     |
   |                         |--- Plays `pull_string.mp3` after 2000ms delay                        |
   |                         |--- Plays weighted Conch Voice Line after 4133ms delay                |
   |                         |--- Auto-resets card to selection after 5000ms                        |
```

---

## 4. Wallet Provider Technical Specification

### A. Plug Wallet Integration (`window.ic.plug`)
**Reference Documentation:** [Plug Developer Guides](https://docs.plugwallet.ooo/developer-guides/getting-started/)

1. **Detection & Connection**:
   - Check if `window.ic?.plug` is available in the browser.
   - Whitelist the target backend canister and ICP Ledger (`ryjl3-tyaaa-aaaaa-aaaba-cai`).
   ```javascript
   const nssWhitelist = ['ryjl3-tyaaa-aaaaa-aaaba-cai', '<BACKEND_CANISTER_ID>'];
   const connected = await window.ic.plug.requestConnect({
     whitelist: nssWhitelist,
     host: 'https://icp-api.io'
   });
   ```
2. **Identity & Balance Retrieval**:
   - Extract principal: `const principal = window.ic.plug.sessionManager.sessionData.principalId;`
   - Retrieve ICP balance: `const balance = await window.ic.plug.requestBalance();`
3. **Transaction Execution (`requestTransfer`)**:
   - Send 0.01 ICP (`1_000_000` e8s) to the oracle vault/treasury account.
   ```javascript
   const transferOpts = {
     to: '<ORACLE_TREASURY_ACCOUNT_ID_OR_PRINCIPAL>',
     amount: 1_000_000, // 0.01 ICP in e8s
     opts: {
       fee: 10_000 // Standard ICP ledger transaction fee (0.0001 ICP)
     }
   };
   const result = await window.ic.plug.requestTransfer(transferOpts);
   // Returns { height: number } (the block index on the ICP ledger)
   ```

---

### B. Oisy Wallet Integration (ICRC-25 / ICRC-21 / ICRC-49)
**Reference Specification:** `@dfinity/oisy-wallet-signer/icp-wallet` & DFINITY `wallet-integration` skill

1. **Connection & Channel Setup**:
   - Import explicitly from `@dfinity/oisy-wallet-signer/icp-wallet`:
   ```javascript
   import { IcpWallet } from '@dfinity/oisy-wallet-signer/icp-wallet';
   
   const wallet = await IcpWallet.connect({
     url: 'https://oisy.com'
   });
   ```
2. **Permission Handling**:
   - Request permissions upfront to prevent per-action popup fatigue:
   ```javascript
   await wallet.requestPermissionsNotGranted();
   const accounts = await wallet.accounts();
   const userAccount = accounts[0]; // { owner: Principal, subaccount?: Uint8Array }
   ```
3. **ICRC-21 Consent & Transfer Approval**:
   - Trigger the ICP transfer request; Oisy automatically fetches the ICRC-21 consent message, prompts the user in a popup, and executes the ledger call:
   ```javascript
   const blockIndex = await wallet.transfer({
     to: { owner: Principal.fromText('<ORACLE_TREASURY_PRINCIPAL>') },
     amount: 1_000_000n, // BigInt 0.01 ICP in e8s
     ledgerCanisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai'
   });
   ```

---

### C. Internet Identity (`@dfinity/auth-client`)
1. **Authentication**:
   ```javascript
   import { AuthClient } from '@dfinity/auth-client';
   import { AccountIdentifier, LedgerCanister } from '@dfinity/ledger-icp';
   
   const authClient = await AuthClient.create();
   await authClient.login({
     identityProvider: 'https://identity.ic0.app',
     onSuccess: async () => {
       const identity = authClient.getIdentity();
       const principal = identity.getPrincipal();
       // Create authenticated agent and ledger actor
     }
   });
   ```
2. **Direct Ledger Transfer**:
   - Construct `LedgerCanister` with the authenticated identity and trigger `transfer()`.

---

## 5. On-Chain Verification & Canister Backend Architecture

To ensure security and prevent replay attacks, the transaction MUST be verified on-chain before unlocking the Oracle string pull.

### Canister Methods (Motoko / Rust Backend)

```motoko
// Backend Canister Interface (oracle.did)
service : {
  // Verifies the 0.01 ICP ledger block transaction and records the user's prompt question
  verify_payment_and_prompt : (block_index: nat64, question: text) -> (variant { ok: text; err: text });
  
  // Queries active prompt authorization status for a user session
  check_authorization_status : (user: principal) -> (bool);
}
```

### Verification Logic Flow
1. **Frontend Call**: Upon receiving `blockIndex` from Plug / Oisy / II, the dApp calls `verify_payment_and_prompt(blockIndex, selectedQuestion)`.
2. **Canister Inter-Canister Call**:
   - The backend canister performs an inter-canister call to the ICP Ledger (`ryjl3-tyaaa-aaaaa-aaaba-cai`) method `query_blocks` or `get_transactions` to verify:
     - **Amount**: Exactly `1_000_000` e8s (0.01 ICP).
     - **Recipient**: Matches the Oracle Canister / Treasury Account.
     - **Uniqueness**: The `blockIndex` has not been used previously (prevents double-spending replay).
3. **Authorization Confirmation**:
   - On successful verification, the canister records the transaction record and returns `variant { ok = "Authorized" }`.

---

## 6. Frontend State Machine & Audio/Animation Synchronization

Once `verify_payment_and_prompt` returns `ok`:

1. **Card Transition to "THE ORACLE SPEAKS"**:
   - Update `.ask-conch-overlay` HTML state to State 2 (`The cord is ready`).
   - Enable the `PULL THE CORD` wooden action button.

2. **Cord Pull Sequence (`onPullCord`)**:
   - User clicks `PULL THE CORD`.
   - Set button text to `Pulling...` and set `disabled = true`.
   - Trigger Three.js / WebGPU camera & cord displacement animation timeline.

3. **Audio Playback Synchronization**:
   - **String Pull Sound**: At frame 60 (2000ms delay at 30fps), play `/audios/pull_string.mp3`.
   - **Oracle Voice Response**: At frame 124 (4133ms delay at 30fps), select and play a weighted voice response from `/audios/` (favoring `No..mp3` and `Nothing..mp3` per weighted selection algorithm).

4. **Lockout & Reset**:
   - At animation finish (`onPullFinished`), lock button text to `Oracle Answered` (`disabled = true`).
   - At 5000ms post-pull, trigger `resetCardToAskState()`, clearing selection and restoring the card to State 1 ready for the next prompt.

---

## 7. Security Rules & Integration Checklist

- [x] **No Code Edits Executed**: Architecture document created for plan review.
- [x] **Explicit per-action approval**: Per ICRC-25/21, no background transaction execution without user consent.
- [x] **Import Subpath Integrity**: Standardized subpath imports for `@dfinity/oisy-wallet-signer` (`/icp-wallet`).
- [x] **Double-Spend Prevention**: Canister verifies block index uniqueness on-chain before returning authorization.
- [x] **Safe Area & Responsive UI Preservation**: All modals and wallet wrappers preserve `--layout-scale` and `100svh` mobile safe area offsets documented in `SCREEN_SYSTEM.md` and `mobile_viewport_study.md`.

---
*Plan created for Bobo Labs NAK MVP Web3 Integration.*
