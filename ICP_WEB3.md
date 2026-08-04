# NAK Magic Conch — ICP Web3 Integration

Status: implementation is on `feature/icp-web3`. TESTICP staging was deployed on 2026-08-04. No real ICP payment has been requested.

## What is implemented

- OISY signer integration using the ICRC-21/25/27/29/49 flow.
- A Plug adapter for the production ICP ledger. Plug is intentionally unavailable in TESTICP staging.
- A Motoko oracle canister that verifies the authoritative ledger block directly before requesting `raw_rand`, with the official index canister retained as a compatibility fallback.
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

## Live staging deployment

| Component | Canister ID |
| --- | --- |
| Backend oracle | `dal4e-uyaaa-aaaad-qmbza-cai` |
| Frontend assets | `dhk2q-zaaaa-aaaad-qmbzq-cai` |

Public URL: <https://dhk2q-zaaaa-aaaad-qmbzq-cai.icp.net/>

The deployment uses the `nak-staging` CLI identity as the sole controller. Both canisters are running, their deployed configuration points to the official TESTICP ledger and index canisters, and desktop/mobile checks load the GLB without texture errors. The asset policy explicitly permits the temporary `blob:` URLs used by Three.js for textures embedded in the GLB while keeping raw access disabled. The canister mapping is committed at `.icp/data/mappings/staging.ids.json` so later upgrades target these same canisters.

The canonical public hostname is the current `icp.net` URL above. `https://dhk2q-zaaaa-aaaad-qmbzq-cai.icp0.io/` also serves the certified frontend, but the older `ic0.app` gateway rejects this canister with `client_domain_canister_mismatch`. Use `icp.net` for wallet testing and public links.

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

## Staging verification checklist

Completed: canonical Linux build, named identity creation, cycle funding, staging deployment, canister status/config checks, desktop/mobile GLB checks, all 12 MP3 decode/HTTP checks, and an on-chain TESTICP settlement.

The settlement test transferred 0.01 TESTICP to a unique backend subaccount at ledger block `854005`. Direct ledger verification returned answer ID `4`; an idempotent retry returned the same answer, and a different claim against the block returned `blockAlreadyClaimed`. At test time the TESTICP index was more than 8,000 blocks behind the ledger, which is why direct ledger verification is the primary path.

Remaining wallet flow:

1. Obtain TESTICP in the OISY staging wallet and select IC testnet tokens in OISY.
2. Open the deployed frontend and connect OISY.
3. Select a question, approve one 0.01 TESTICP transfer, wait for ledger verification, then pull the cord.
4. Verify that refresh/retry returns the same answer for the same block and that a block cannot be claimed with a different commitment.

Future staging upgrades use the committed IDs:

```bash
icp deploy -e staging --identity nak-staging
```

## Design boundary

The Web3 work does not alter either GLB, Three.js shaders, lighting, camera behavior, post-processing, responsive layout rules, audio files, pull animation, or the 4,133 ms voice timing. The visible changes are limited to truthful payment wording, OISY/Plug wallet choices, real connection status, and the existing modal being used as a non-authorizing progress/error panel.
