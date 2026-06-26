# Web3 Interactive Interface Documentation

This document logs the new Web3 user interface implemented in `index.html`, `src/style.css`, and `src/main.js`. 

---

## 1. Top HUD branding and banner overlay
The HUD branding sits relative to the viewport, while HUD banner elements sit on top of the Blender wooden table mesh:
- **Transparent Background**: The HTML background bar has been set to transparent (`background: transparent; border-bottom: none; box-shadow: none`) so that the connection button sits cleanly on top of the pre-rendered 3D wooden table mesh.
- **Top-Left Brand Wrapper (`#hud-brand-container`)**:
  - Displays the **hover-animated conch icon button** (`#hud-icon-btn`), which triggers frame-by-frame conch animations on hover.
  - Displays the **`$NAK` text label** right next to the animated conch button at the same vertical height.
  - Both elements scale and offset dynamically relative to the window height during resizing.
- **Right Side (Wallet Connect)**: A pink, wooden-styled button showing `Connect Wallet`. When clicked, it displays a dropdown selection menu with three mock providers:
  - **Internet Identity** (♾️)
  - **Plug Wallet** (🔌)
  - **Bitfinity Wallet** (🔮)
- **Simulated Connection state**: Clicking any wallet provider mock-connects, closing the dropdown, updating the button's background to yellow, and displaying:
  `[ b3a1...7x9 | 4.20 ICP ]`

---

## 2. "ASK THE CONCH" Yellow Card
We implemented the cartoonish yellow conch card (resembling SpongeBob's texture with custom dark-yellow spots) on the right side overlay of the viewport. The card is pushed down vertically by **20%** of the viewport height to align it more centered and aesthetic relative to the conch mesh.

### A. Parchment scroll selection
Contains a scroll wrapper with radio options for selecting a query. The second option is randomized on load:
- *"Will my 8-year NNS stake make me generational wealth?"*
- *"Should I buy $<TOKEN>?"* (Randomly chooses between **$EXE**, **$WUMBO**, or **$MCDOMS** on page refresh).
- *"Is the bull market back or am I being exit liquidity?"*
- *"Will DFINITY ever market ICP properly?"*
- *"Should I rage-tweet at Dom or keep holding?"*

### B. Wooden Board BURN Button
The yellow card contains a wooden board action button at the bottom labeled `BURN 0.01 ICP TO PROMPT`.
- Disabled by default.
- Enabled as soon as any radio option is selected.
- Typing prophecies or vaporizing cycles text details have been removed.

---

## 3. Transaction Signature Request Modal
Clicking the enabled **BURN** button opens a simulated Web3 signature pop-up overlay matching the chosen wallet provider:
- **Header**: Displays the active wallet's avatar and name.
- **Body details**: Lists Canister ID, Amount (0.01 ICP), Gas Fee (0.0001 ICP), and a custom message package to sign (`ask_oracle("selected question text")`).
- **Actions**:
  - **Reject**: Closes the signature modal and returns the user to selection.
  - **Approve**: Starts a 1.5s simulated transaction signing loading spinner, then automatically closes the modal and transitions the yellow card overlay.

---

## 4. "THE ORACLE SPEAKS" Pull Cord State
Once the transaction is successfully approved and signed:
- The yellow card transitions to state 2.
- Subtitle changes to `The cord is ready` accompanied by a swinging conch graphic.
- Displays a `PULL THE CORD` wooden button.
- Clicking the button triggers the conch pulling animation (`onPullCord()`) and updates to a disabled `Pulling...` state.
- 5 seconds after the animation finishes (`onPullFinished()`), the card automatically resets back to state 1 with radio selections cleared.
