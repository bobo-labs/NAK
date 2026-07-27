# Complete Session & Development History Backup — NAK MVP

> **Backup Date:** July 27, 2026  
> **Project:** Bobo Labs NAK Web3 3D Portal (`f:\NAK-MVP`)  
> **Repository:** [https://github.com/bobo-labs/NAK.git](https://github.com/bobo-labs/NAK.git)

---

## 1. Overview & Purpose

This file serves as a complete, comprehensive backup of the entire agent chat history, design decisions, architectural evolutions, bug fixes, asset specifications, and Web3 integration plans for the **NAK MVP** portal. 

It was compiled to ensure full data preservation prior to system upgrades (e.g., OS updates to Windows 11).

---

## 2. Chronological Summary of Work & User Requests

### Phase 1: 3D Scene Initialization & Camera Framing
- **Scene Assets**: Integrated `Scene_Desktop.glb` (landscape 1920x953) and `Scene_Vertical.glb` (portrait 886x1920).
- **Blender Camera Alignment**: Implemented exact Blender camera lens math. Preserved constant Hor+ horizontal FOV (`25.4°`) in landscape and constant Vert+ vertical FOV (`25.36°`) in portrait mode, avoiding DOM race conditions during window resize.
- **Lighting & Post-Processing**: Upgraded to Three.js WebGPU renderer with custom tone mapping exposure, depth of field (Bokeh pass), and toon outline passes.

### Phase 2: Responsive Screen System & Unified UI Scale
- **Aspect Locking**: Configured `.canvas-container` to lock max-height to `1920x953` (landscape) and `886x1920` (portrait).
- **Unified Layout Scale**: Derived `--layout-scale` directly from viewport width (`visualViewport.width / 1920`), ensuring top navbar, `$NAK` logo, Connect Wallet button, and Ask the Conch card scale down proportionally without breaking layout boundaries.
- **Mobile Safe Areas**: Applied `100svh`, `viewport-fit=cover`, and `env(safe-area-inset-top/bottom)` to clear iOS/Android notches, dynamic address bars, and home swipe bars.

### Phase 3: "Ask the Conch" Parchment Card & Audio System
- **Parchment Scroll Styling**: Custom SpongeBob-textured yellow card with carved inner-shadow scrollbar tracks and wooden handles.
- **Query Selection**: Radio option group with randomized query choices ($EXE, $WUMBO, $MCDOMS).
- **Interactive Action Buttons**: Textured wooden action buttons transitioning smoothly across states:
  - `BURN 0.01 ICP TO PROMPT` (disabled until query selected)
  - `PULL THE CORD` (unlocked upon transaction verification)
  - `Pulling...` (during 3D cord pull animation)
  - `Oracle Answered` (lockout state post-animation)
  - Auto-reset back to `PULL THE CORD` / `Ask the Conch` after 5 seconds.
- **Frame-Accurate Audio Sync**:
  - `pull_string.mp3` triggered at 2000ms delay (frame 60 at 30fps).
  - Weighted random conch voice response from `/public/audios/` triggered at 4133ms delay (frame 124), favoring `No..mp3` and `Nothing..mp3` (~26.3% chance each).
  - Proactive timeout clearing (`clearTimeout`) to prevent audio overlap or race conditions on rapid re-triggers.

### Phase 4: Floating Market Bubbles & Custom Physics Engine
- **Live Ecosystem Data**: Fetched top 3 gainers and top 3 losers (6 bubbles) from icptokens.net via Vite CORS proxies (`/api-icp`) and GeckoTerminal fallbacks.
- **Special Promo Bubble (`$NAK`)**:
  - Canister ID: `eig2s-waaaa-aaaam-qbg5a-cai`.
  - Scaled to 300px with a glowing golden breathing halo keyframe animation (`promoGlow`).
- **Initial Load & Off-Screen Spawn**:
  - Configured static start position at `bottom: -350px` with positive staggered delays (0–10s) so no bubbles appear pre-rendered on screen load.
- **60fps JS Physics Engine**:
  - Replaced CSS keyframe animations with a custom 60fps `requestAnimationFrame` render loop.
  - **Circle Hitbox Collisions**: Calculated real-time circle distance overlaps and pushed colliding bubbles apart horizontally, preventing clipping or overlapping.
  - **Hover Pausing**: Added `mouseenter`/`mouseleave` event tracking to freeze coordinates on hover and resume on exit.
  - **Looping Randomization**: Filtered loop events (`e.animationName === 'floatUp'`) so X coordinates randomize only when bubbles reset off-screen at the bottom.

### Phase 5: Web3 ICP Wallet & Backend Integration Specifications
- **Master Plan Document**: Created [plan.md](file:///f:/NAK-MVP/plan.md) outlining end-to-end wallet connection, transaction signing, on-chain verification, and animation unlocking.
- **Supported Wallets**:
  - **Plug Wallet (`window.ic.plug`)**: Whitelist setup, principal retrieval, balance fetching, and `requestTransfer`.
  - **Oisy Wallet (ICRC-21/25/27/29/49)**: Implemented `@dfinity/oisy-wallet-signer/icp-wallet` subpath imports, `requestPermissionsNotGranted`, and ICRC-21 consent message transfer approval.
  - **Internet Identity (`@dfinity/auth-client`)**: Delegation authentication and direct ICP ledger canister transfers.
- **On-Chain Double-Spend Prevention**: Canister backend checks ICP Ledger (`ryjl3-tyaaa-aaaaa-aaaba-cai`) block index, amount (0.01 ICP), recipient, and uniqueness before issuing authorization.
- **Local Skill Index**: Created [.agents/skills/icp-skills/SKILL.md](file:///f:/NAK-MVP/.agents/skills/icp-skills/SKILL.md) and [docs/icp_skills/](file:///f:/NAK-MVP/docs/icp_skills/) containing official DFINITY skills.

---

## 3. Repository File Structure & Key Documents

| File Path | Description |
|---|---|
| [`src/main.js`](file:///f:/NAK-MVP/src/main.js) | Main application entry point: 3D scene, cameras, GLB model loader, audio triggers, bubble physics engine |
| [`src/style.css`](file:///f:/NAK-MVP/src/style.css) | Core CSS design system, responsive layout scaling (`--layout-scale`), HUD styling, card overlays, mobile safe areas |
| [`index.html`](file:///f:/NAK-MVP/index.html) | HTML container structure, HUD top bar, Connect Wallet wrapper, Ask the Conch modal, bubbles container |
| [`vite.config.js`](file:///f:/NAK-MVP/vite.config.js) | Vite dev server configuration and `/api-icp` proxy redirection |
| [`WEB3_INTERFACE.md`](file:///f:/NAK-MVP/WEB3_INTERFACE.md) | Documentation of Web3 UI overlays, brand wrappers, wallet dropdowns, and card states |
| [`SCREEN_SYSTEM.md`](file:///f:/NAK-MVP/SCREEN_SYSTEM.md) | Technical study on camera FOV, aspect ratio locking, unified scaling, and mobile portrait mode |
| [`mobile_viewport_study.md`](file:///f:/NAK-MVP/mobile_viewport_study.md) | Study on `100svh`, safe-area insets, notch clearance, and `visualViewport` API integration |
| [`walkthrough.md`](file:///f:/NAK-MVP/walkthrough.md) | Detailed walkthrough of bug fixes, audio synchronization, DoF benchmarking, and layout enhancements |
| [`plan.md`](file:///f:/NAK-MVP/plan.md) | Comprehensive Web3 integration plan for Plug, Oisy, Internet Identity, and ICP Ledger burn verification |
| [`.agents/skills/icp-skills/SKILL.md`](file:///f:/NAK-MVP/.agents/skills/icp-skills/SKILL.md) | Local agent skill for DFINITY Internet Computer standards and pitfalls |
| [`docs/icp_skills/`](file:///f:/NAK-MVP/docs/icp_skills/) | Detailed reference guides for `wallet_integration.md`, `icrc_ledger.md`, and `internet_identity.md` |

---

## 4. GitHub Synchronization & Commit History

All recent updates—including physics hitboxes, off-screen bubble entry, mobile safe-area spacing, Web3 architecture specs, and skill documentation—have been committed and pushed to the primary remote repository (`main` branch):

```bash
git add .
git commit -m "docs: backup complete session history and development documentation"
git push origin main
```

---
*Backup created for Bobo Labs NAK MVP Web3 Interactive Portal.*
