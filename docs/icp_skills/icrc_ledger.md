# ICRC Token Ledgers & ICP Ledger Guide

> **Source:** DFINITY Internet Computer Official Skills (`https://skills.internetcomputer.org/skills/icrc-ledger/`)

## Canister IDs

| Token | Ledger Canister ID | Decimals | Base Fee |
|---|---|---|---|
| **ICP** | `ryjl3-tyaaa-aaaaa-aaaba-cai` | 8 | 10,000 e8s (0.0001 ICP) |
| **ckBTC** | `mxzaz-hqaaa-aaaar-qaada-cai` | 8 | 10 satoshis |
| **ckETH** | `ss2fx-dyaaa-aaaar-qacoq-cai` | 18 | Dynamic |

Index Canister IDs:
- **ICP Index**: `qhbym-qaaaa-aaaaa-aaafq-cai`

---

## Critical Rules & Common Pitfalls

1. **Fee Verification (`icrc1_fee`)**: Always look up transfer fees dynamically via `icrc1_fee` query call on the ledger canister. Handle `BadFee { expected_fee }` error responses if fees change.
2. **Result Matching**: `icrc1_transfer` returns `Result<Nat, TransferError>`. Always match on error variants: `BadFee`, `BadBurn`, `InsufficientFunds`, `TooOld`, `CreatedInFuture`, `Duplicate`, `TemporarilyUnavailable`, `GenericError`.
3. **Account Format**: An ICRC-1 Account is structured as `{ owner: Principal, subaccount: ?Blob }`. Passing `null` / `None` uses the default subaccount (all 32 zeros).
4. **Deduplication Protection (`created_at_time`)**: Always populate `created_at_time` with current time (`Time.now()` in Motoko / `ic_cdk::api::time()` in Rust) to enable ledger deduplication protection against accidental repeat submissions.
5. **Principal Types**: Always parse principals using `Principal.fromText(...)` rather than passing raw string representations.
