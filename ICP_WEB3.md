# NAK Magic Conch — ICP Web3 Integration

Status: implementation is on `feature/icp-web3`. No canister has been deployed and no real ICP transaction has been requested.

## What is implemented

- OISY signer integration using the ICRC-21/25/27/29/49 flow.
- A Plug adapter for the production ICP ledger. Plug is intentionally unavailable in TESTICP staging.
- A Motoko oracle canister that verifies ledger payments through the official ICP index canister before requesting `raw_rand`.
- Replay protection keyed by ledger block, a re-entrancy-safe `verified -> answering -> complete` receipt journal, and idempotent settlement retries.
- On-chain answer selection with the original audio distribution: `No` and `Nothing` each have weight 5; each remaining answer has weight 1.
- A generated TypeScript actor through `@icp-sdk/bindgen` and the asset canister `ic_env` cookie.
- Certified asset hosting configuration with raw access disabled.

The question text is not written on-chain. The browser creates a unique 32-byte payment subaccount and stores only a SHA-256 question commitment in the ledger memo. The canister verifies the exact recipient, amount, memo, block, and replay status.

## Networks

| Environment | Network | Token | Ledger | Index |
| --- | --- | --- | --- | --- |
| `staging` | Live Internet Computer | Valueless `TESTICP` | `xafvr-biaaa-aaaai-aql5q-cai` | `qcuy6-bqaaa-aaaai-aqmqq-cai` |
| `production` | Live Internet Computer | Real `ICP` | `ryjl3-tyaaa-aaaaa-aaaba-cai` | `qhbym-qaaaa-aaaaa-aaafq-cai` |

Both use 8 decimals, a 10,000 e8s ledger fee, and a 1,000,000 e8s (0.01 token) oracle payment.

`production` exists as configuration only. Do not deploy it until staging is tested and the real-token wording, treasury policy, controllers, monitoring, and upgrade process are approved.

## Windows without WSL

The website and its deployed ICP integration work in a normal browser on Windows. Native Windows can run:

```powershell
npm ci
npm test
npm run check:motoko:windows
npm run build
```

`npm run check:motoko:windows` uses the official Motoko compiler compiled for Node.js. It performs type-checking, a full Wasm compile, Candid generation, and the backend unit tests.

The canonical Mops toolchain and the managed local ICP replica do not support native Windows. Use one of these for the canonical `mops check` / `icp build` / deploy step:

1. The included Ubuntu GitHub Actions workflow.
2. WSL 2 with Docker Desktop.
3. Any Linux development or CI machine.

This limitation affects local canister compilation/deployment, not users of the deployed app. Staging also does not require a public ICP testnet: it runs isolated NAK canisters on the live IC, paid with valueless TESTICP tokens. The staging canisters still require real cycles.

## Local frontend

The current visual app remains available without an ICP backend:

```powershell
npm run dev
```

The wallet button will report that the backend is not deployed; it will never simulate a successful payment.

After a staging backend is deployed and recorded by `icp-cli`, Vite can target it through the official `ic_env` cookie simulation:

```powershell
$env:ICP_ENVIRONMENT = 'staging'
npm run dev
```

Remove the variable when finished:

```powershell
Remove-Item Env:ICP_ENVIRONMENT
```

## Staging checklist

1. Run the GitHub Actions checks or the canonical Mops checks on Linux.
2. Create or select a named `icp` CLI identity and fund it with enough cycles for two canisters plus storage.
3. Deploy only staging:

   ```bash
   icp deploy -e staging
   ```

4. Commit `.icp/data/mappings/staging.ids.json`; never ignore or delete `.icp/data`.
5. Obtain TESTICP from the official faucet and select IC testnet tokens in OISY.
6. Connect OISY, select a question, approve one 0.01 TESTICP transfer, wait for index settlement, then pull the cord.
7. Verify that refresh/retry returns the same answer for the same block and that a block cannot be claimed with a different commitment.
8. Test desktop and mobile screenshots against the pre-integration visual baseline.

No staging deployment is performed by this branch because deployment creates on-chain state and consumes cycles.

## Design boundary

The Web3 work does not alter either GLB, Three.js shaders, lighting, camera behavior, post-processing, responsive layout rules, audio files, pull animation, or the 4,133 ms voice timing. The visible changes are limited to truthful payment wording, OISY/Plug wallet choices, real connection status, and the existing modal being used as a non-authorizing progress/error panel.
