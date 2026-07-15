# Walkthrough - UI & Layering Enhancements

This document summarizes the recent updates made to resolve rendering issues and enhance the visual style of the application.

---

## 1. Fixing Conch Overlay Layering

We solved the issue where the animated conch character was rendering behind the wooden HUD bar (`tabla_hud`) at the top of the viewport.

### Cause of the Issue
To prevent the **Depth of Field (DoF)** pass from blurring the HUD, `tabla_hud` was moved to **Layer 1** and rendered in an isolated HUD render pass, which is then overlaid on top of the main scene (Layer 0). 

Because the conch character parts (shell, cord, arms, hands) remained only on Layer 0, `tabla_hud` was drawn over them in the final composite step, regardless of their actual 3D distance to the camera.

### Changes Made
In [src/main.js](file:///f:/NAK-MVP/src/main.js):
1. **Conch Part Layer Settings**: We enabled **Layer 1** on all mesh objects belonging to the conch character (names including `conch`, `cord`, `cylinder`, `arm`, `body`, and `hand`). They are now active in both Layer 0 (for shadows/DoF) and Layer 1.
2. **HUD Depth Testing**: In the HUD compositing pass, the conch character parts now render alongside `tabla_hud` on Layer 1. Standard depth testing naturally determines that the conch character is physically closer to the camera and renders it *over* the table.
3. **Toon Outlines on HUD**: We wrapped `hudPassNode` in `toonOutlinePass` when outlines are enabled so the conch and table preserve their stylized borders in the HUD overlay.

### Verification Results
Below is the screenshot of the scene showing the conch overlapping in front of the top wood beam correctly:

![Fixed Conch Overlay](C:/Users/Alejandro/.gemini/antigravity-ide/brain/f32141bb-fab8-4389-a986-5cc154cbe2c2/initial_page_load_1782490423272.png)

---

## 2. Texturized Scrollbar Thumb & Track Inner Shadow on "Ask the Conch" Card

We updated the scrollbar in the **Ask the Conch** card so that only the draggable handle (thumb) is wood-textured using a 90-degree rotated version of `Tabla.png` with custom scaling, while the track features a carved inner shadow that blends with the container background.

### Changes Made
In [src/style.css](file:///f:/NAK-MVP/src/style.css#L612-L635):
1. **Scrollbar Track**:
   - Re-introduced the inset shadow (`box-shadow: inset 2px 0 5px rgba(0, 0, 0, 0.4)`) to make the track look like a carved groove.
   - Kept the track background color solid `#f6ebd2` (matching the parchment card background exactly) to prevent the WebKit rendering bug that causes vertical stripes.
2. **Scrollbar Thumb**:
   - Restored the custom background properties: `background-size: 1000% 200%`, `background-repeat: no-repeat`, `background-position: 25% 50%`, and `border: url('/Tabla_90.png')` to display the texture exactly as desired.

---

## 3. Simplified Square Parchment Text Container (Caps Removed)

We removed the top and bottom rolled-up scroll caps from the **Ask the Conch** card, replacing them with a closed, square parchment box with a solid 4px border all around.

### Changes Made
In [src/style.css](file:///f:/NAK-MVP/src/style.css#L578-L611):
1. **Scroll Caps Hidden**: Added `display: none !important;` to `.scroll-cap` to hide both the top and bottom rolled-up graphics.
2. **Parchment Container Borders**:
   - Changed `.scroll-body` to have a full border on all 4 sides (`border: calc(4px * var(--conch-scale, 1)) solid #3c2312`).
   - Kept the corners square (removed the rounded border radius) so it frames the text box cleanly.

---

## 4. Delay-Triggered Pull String & Voice Audio Effects

We integrated the `pull_string.mp3` sound effect and a weighted random voice responder system from `/public/audios/` to playback audio precisely synced with the cord-pulling action.

### Changes Made
In [src/main.js](file:///f:/NAK-MVP/src/main.js):
1. **String Pull Audio**: Plays `/pull_string.mp3` after a 60-frame delay (2000ms at 30 FPS) when the pull action is initiated.
2. **Conch Response Voice (Weighted Random)**:
   - Preloaded all 11 voice lines from `/public/audios/`.
   - Programmed a random selector favoring `No..mp3` and `Nothing..mp3` (weight = 5 each, ~26.3% chance each) over the remaining 9 responses (weight = 1 each, ~5.3% chance each).
   - Scheduled the voice to trigger after a 124-frame delay (exactly 4133ms at 30 FPS).
3. **Interrupt Handling**: Added safety loops to pause and reset any currently playing voice/pull audio from previous runs if a new cord pull is requested, preventing overlapping audio.
4. **Timeout Management & Race Condition Protection**:
   - Declared global variables `pullSoundTimeoutId`, `voiceSoundTimeoutId`, and `resetCardTimeoutId` to monitor active timeouts.
   - Implemented proactive clearing (`clearTimeout`) for all pending timeouts inside `onPullCord` and `onPullFinished` to prevent delayed audio or UI state resets from previous runs leaking into subsequent quick pulls.

---

## 5. Verification & Testing

We verified the complete flow using a browser subagent:
1. **Wallet Connection**: Confirmed correct rendering of mock-connected wallet state at the top banner.
2. **Oracle Prompt & Signature**: Checked transaction workflow where selecting a question, burning iCP, and approving the signature correctly transitions the UI.
3. **Audio Delay & Overlap Protection**: Verified that clicking "PULL THE CORD" starts the animation, plays `pull_string.mp3` exactly after 2000ms, and playing a weighted conch response after 4133ms.
4. **Browser Console Health**: Injected logging hooks to monitor warnings and errors; confirmed **0 console errors or warnings** occurred.

Below is the verified end-to-end flow animation recorded by the browser subagent:

![Browser Flow Recording](C:/Users/Alejandro/.gemini/antigravity-ide/brain/f32141bb-fab8-4389-a986-5cc154cbe2c2/test_verified_sound_flow_1782502089857.webp)

---

## 6. GPU Warmup & Calibration Correction

### Cause of the Issue
On the very first visit, the browser must compile shaders, assemble pipelines, and upload textures to the GPU. This creates a brief rendering stutter (high frame times) during the first few frames. 

Because the benchmark started measuring immediately, the initial compilation spike skewed the average frame time upwards, tricking the portal into defaulting to the **Low Quality** profile. On subsequent reloads, the shaders were fetched directly from the browser/driver's compilation caches, resulting in smooth frames and a correct **High/Medium** profile assignment.

### Changes Made
In [src/main.js](file:///f:/NAK-MVP/src/main.js):
1. **Warmup Phase Delay**: Added a warmup period (`warmupFrameCount` and `WARMUP_FRAMES_LIMIT = 45`) right after the model is loaded.
2. **Postponed Calibration**: Delayed the benchmarking loop by 45 frames (about 1.5 seconds) to allow the GPU pipelines to completely initialize and warm up.
3. **Preloader Sync**: Kept the preloader overlay active during the warmup to hide any initial compilation stutter, ensuring the user only transitions into the scene once performance has stabilized.

---

## 7. Resizing & Viewport Calibration Fix

We resolved the layout issue where the conch shell shrunk to a tiny size and drifted far below the top wooden HUD bar when the window was resized to taller proportions, while adhering to the design specifications in [SCREEN_SYSTEM.md](file:///f:/NAK-MVP/SCREEN_SYSTEM.md).

### Cause of the Issue
During window resize events, querying `canvasContainer.clientWidth` and `clientHeight` directly in Javascript was subject to a DOM race condition. The browser fired the resize event before recalculating styles and layout, returning the unconstrained window height instead of the clamped `max-height` container height. This caused the JS to compute a false, tall aspect ratio (e.g. `1.10`), which dynamically pushed the camera VFOV to a very wide zoom-out (`22.8°` instead of `12.76°`) and caused overlays (like the card) to scale incorrectly.

### Changes Made
1. **Synchronous Math Calculations**: In [src/main.js](file:///f:/NAK-MVP/src/main.js), we replaced DOM `clientWidth`/`clientHeight` queries in `getContainerSize()` with a mathematical viewport-to-aspect formula matching the CSS constraints:
   ```javascript
   const containerW = w;
   const containerH = Math.round(Math.min(h, w * (953 / 1920)));
   ```
   This is synchronous, completely layout-independent, and eliminates style recalculation race conditions on load and resize.
2. **Preserving Hor+ Camera Scaling**: Kept the Blender-specified horizontal FOV camera model (`DESIGN_HFOV_DEG = 25.4`) as documented in [SCREEN_SYSTEM.md](file:///f:/NAK-MVP/SCREEN_SYSTEM.md). With the correct container dimensions now being fed into the math, the camera successfully calculates the proper `12.76°` VFOV on tall letterboxed screens, keeping the conch shell at its perfect design size and position without any top-clipping or shrinking.

### Verification Results
Here are the final screenshots showing perfect layout scaling and alignment:

````carousel
![Portrait View (500x800)](C:/Users/Alejandro/.gemini/antigravity-ide/brain/f32141bb-fab8-4389-a986-5cc154cbe2c2/portrait_500x800_1782930669128.png)
<!-- slide -->
![Landscape View (988x445)](C:/Users/Alejandro/.gemini/antigravity-ide/brain/f32141bb-fab8-4389-a986-5cc154cbe2c2/landscape_988x445_1782930648069.png)
````

---

## 8. Unified UI Scale System

We implemented a single, unified scale system (`--layout-scale`) for all HTML overlays, ensuring that the brand icon, $NAK title, and Connect Wallet button scale down proportionally on small viewports and portrait modes.

### Cause of the Issue
Previously, scaling was calculated dynamically from container height. On small or portrait screens where height collapses, the scale dropped to `0.22`, shrinking elements (like the wallet button) to illegible dimensions (~3px). Concurrently, the `$NAK` logo font size was hardcoded to `40px` and did not scale down at all, breaking alignment and clipping off the wooden bar.

### Changes Made
1. **Width-Based Scaling**: In [src/main.js](file:///f:/NAK-MVP/src/main.js), we updated `updateLayoutScale()` to calculate a single scale factor from the container width (which is always stable as it fills the full viewport width) rather than container height:
   ```javascript
   const scale = Math.max(0.35, containerW / 1920);
   canvasContainer.style.setProperty('--layout-scale', scale);
   ```
2. **Unified CSS Formulas**: Replaced all individual layout CSS custom variables with mathematical `calc()` rules in [src/style.css](file:///f:/NAK-MVP/src/style.css) consuming `--layout-scale`. We added `clamp()` limits to prevent text from shrinking below a legible threshold:
   - Header Bar: Height and padding scale together.
   - Logo Text (`$NAK`): Scaled via `clamp(12px, calc(40px * var(--layout-scale)), 40px)`.
   - Connect Wallet Button & Options: Size, borders, padding, shadows, and emoji sizes scale proportionally.
   - Brand Icon: Resizes dynamically using `--layout-scale`.

### Verification Results
Here are the screenshots demonstrating the proportional layout scaling at small/narrow viewports:

````carousel
![Narrow Portrait View (600x900)](C:/Users/Alejandro/.gemini/antigravity-ide/brain/f32141bb-fab8-4389-a986-5cc154cbe2c2/portrait_narrow_1782933476763.png)
<!-- slide -->
![Mini Portrait View (400x700)](C:/Users/Alejandro/.gemini/antigravity-ide/brain/f32141bb-fab8-4389-a986-5cc154cbe2c2/portrait_mini_1782933504504.png)
````

---

## 9. Cord Pull Lockout Fix

We resolved a vulnerability where the user was able to click "PULL THE CORD" multiple times after the pulling animation completed, triggering successive animations and sound effects for a single paid query.

### Cause of the Issue
When the camera animation finished, the event handler `onPullFinished()` set `isPulling = false` and re-enabled the "PULL THE CORD" button (`conchPullBtn.disabled = false`). During the 5-second interval before the card automatically reset back to the ask state, the button remained visible and active in the UI, allowing duplicate triggers.

### Changes Made
In [src/main.js](file:///f:/NAK-MVP/src/main.js):
1. **Lock Button Post-Animation**: Modified `onPullFinished()` to keep the button disabled and update its text to **`Oracle Answered`**:
   ```javascript
   if (conchPullBtn) {
     conchPullBtn.disabled = true;
     conchPullBtn.querySelector('.wood-btn-text').textContent = 'Oracle Answered';
   }
   ```
2. **Reset State Re-enabling**: Updated the card reset method `resetCardToAskState()` to re-enable the button and restore the text back to **`PULL THE CORD`** so it's fresh and ready for the next transaction:
   ```javascript
   if (conchPullBtn) {
     conchPullBtn.disabled = false;
     conchPullBtn.querySelector('.wood-btn-text').textContent = 'PULL THE CORD';
   }
   ```

### Verification Results
Below are the screenshots of the disabled state and the subsequent auto-reset:

````carousel
![Button Disabled (Oracle Answered)](/oracle_answered.png)
<!-- slide -->
![Card Automatically Reset (Ask the Conch)](/ask_conch_reset.png)
````

---

## 10. Mobile Portrait Scene (Scene_Vertical.glb) Support

We added support for dynamically loading the portrait-specific scene (`Scene_Vertical.glb`) when the application runs on vertical/mobile layouts.

### Changes Made
1. **Dynamic Model Loading & Disposal**: In [src/main.js](file:///f:/NAK-MVP/src/main.js), we updated `loadModel()` to automatically detect orientation and load the correct GLB asset (`Scene_Desktop.glb` vs `Scene_Vertical.glb`). When switching, it disposes of old geometries and materials to prevent WebGL context memory leaks.
2. **Container Sizing Aspect Capping**: Extended `getContainerSize()` and media queries in [src/style.css](file:///f:/NAK-MVP/src/style.css) to enforce a `886/1920` aspect lock in portrait mode (matching iPhone's standard 9:19.5 aspect ratio), preserving the layout proportions without stretching:
   - Max container height set to `calc(100vw * 1920 / 886)`.
   - Max container width capped to `calc(100vh * 886 / 1920)`.
3. **Decoupled Landscape & Portrait HUDs**: We decoupled the landscape HUD styling from the portrait mobile overrides:
   - In landscape viewports (default), the top HUD bar, brand logo container, and Connect Wallet button/dropdown remain exactly as they were originally, using `--layout-scale` and their original positioning.
   - In portrait viewports (mobile/vertical screen), the elements automatically shift to mobile-specific overrides inside the `@media (orientation: portrait)` query, using a boosted `--hud-scale` (+35% larger) to maximize legibility on small phone viewports.
   - **Aligned Centering**: Shifted the mobile HUD center line down to `calc(85px * var(--hud-scale))` so the conch logo icon, `$NAK` text, and Connect Wallet button sit exactly centered on the 3D wooden banner beam without hitting or cutting off at the top edge.
   - **HUD Banner Layer Separation**: In `Scene_Vertical.glb`, the wooden HUD banner is split into multiple meshes (`tabla_hud` and `tabla_hud002`). We updated the model traversal in `loadModel()` to check using `.startsWith('tabla_hud')` so that all parts of the mobile HUD banner are correctly moved to Layer 1, completely excluding them from post-processing depth of field blur and keeping the entire frame 100% sharp.
   - **Scale Variable Context Inheritance**: Moved scale variable declarations from `:root` directly into `.canvas-container` so they inherit the inline layout scale context correctly.
4. **Card Repositioning**: Repositioned the conch oracle card overlay (`#ask-conch-overlay`) in portrait viewports using CSS media queries to align with the upper-middle region of the screen (shifted to `calc(185px * var(--hud-scale))` to clear the taller mobile HUD bar and centered horizontally), ensuring zero overlap with the 3D conch shell model at the bottom.
5. **Resolution-Proportional Depth of Field & Benchmarking**:
   - **Resolution-Proportional Blur**: We scale the uniform `dofUniformBokehScale` dynamically inside both `buildPostProcessing()` and `onWindowResize()` based on the actual rendering height (using `953px` as the baseline):
     ```js
     dofUniformBokehScale.value = CONFIG.dofBokehScale * (res.h / 953);
     ```
     This keeps the blur circle constant in terms of vertical screen percentage (approx. 1.4% height), resulting in an equally rich, deep cinematic blur in both landscape and portrait orientations.
   - **Calibration Profiles & HUD Render Fix**: Restored the default calibrator routine. Mobile devices initialize in `MEDIUM` and scale down to `LOW` if performance drops below 28 FPS.
   - **HUD Layer compositing when DoF is disabled**: In the `LOW` quality profile, Depth of Field is disabled (`enableDoF: false`). Originally, this bypassed the compositing pass entirely, making the Layer 1 `tabla_hud` components disappear completely. We fixed this by ensuring that when DoF is disabled, the Layer 1 HUD pass is still correctly composited on top of the main scene:
     ```js
     const baseColorNode = CONFIG.enableSMAA ? smaa(scenePassColor) : scenePassColor;
     postProcessing.outputNode = mix(baseColorNode, hudPassColor, hudMask);
     ```
6. **Orientation Transitions & Fitting**:
   - Re-trigger loading on-the-fly inside the resize event handler when crossing orientation thresholds.
   - Constrained the camera fitting model: Hor+ zoom (design HFOV = 25.4°) for desktop landscape, and Vert+ zoom (constant vertical VFOV = 25.36°) for mobile portrait.
7. **Mobile Viewport & System UI Spacing (Clearances)**:
   - **`100svh` Stabilization**: Replaced standard `100vh` on the `body` and `#app` wrapper with `100svh` to lock layout heights to the visible screen area, preventing dynamic mobile toolbars from obscuring content.
   - **Notch Safe Area Padding**: Upgraded the viewport meta tag in `index.html` with `viewport-fit=cover`, and shifted the portrait HUD bar and dropdowns down by `env(safe-area-inset-top, 0px)` in `src/style.css` to protect logo and buttons from notch and camera cutouts.
   - **Bottom Indicator Padding**: Added `padding-bottom: env(safe-area-inset-bottom, 0px)` on `.canvas-container` in portrait mode to clear the iOS home swipe-bar indicator gesture area.
   - **VisualViewport API Integration**: Replaced standard `window` height checks with the `visualViewport` API inside `getContainerSize()` in `src/main.js` to ensure rendering calculations remain perfectly stable when browser toolbars shrink/grow on scroll.

### Verification Results
Here are the screenshots demonstrating the dynamic orientation switching, the aspect ratio stretching fix, the restored landscape HUD layout, the decoupled portrait mobile layout, the scaled portrait Depth of Field, and safe area/viewport support:

````carousel
![Landscape View Restored (Scene_Desktop)](/landscape_original_restored.png)
<!-- slide -->
![Portrait View Overridden (Scene_Vertical)](/portrait_mobile_overridden.png)
<!-- slide -->
![Portrait Depth of Field Blur Aligned](/portrait_dof_verified.png)
<!-- slide -->
![Portrait Pulled (Oracle Answered)](/portrait_pulled.png)
<!-- slide -->
![Landscape Switch Back](/landscape_switched_back.png)
<!-- slide -->
![Mobile Viewport Safe Areas Verified](/safe_areas_verified.png)
````

---

## 11. Responsive Scaling Overhaul (Viewport-Relative Fix)

We resolved five compounding bugs that caused the HUD bar, $NAK logo, Connect Wallet button, and Ask the Conch card to scale incorrectly on different phone aspect ratios and when zooming.

### Root Causes Fixed

| Bug | Old Behavior | Fix |
|:--|:--|:--|
| **`--layout-scale` used pillarboxed `containerW`** | On phones where the canvas was narrower than the viewport, scale shrank incorrectly | Always use raw `visualViewport.width` (never capped container width) |
| **`--conch-scale` was height-based in portrait** | Card and HUD used different axes — zooming de-synced them | In portrait, `--conch-scale = vw / 886` (same width axis as `--layout-scale`) |
| **`--hud-brand-container` used `top: 3.7%` of container** | At small scales where the floor kicks in, the brand sat above the HUD beam center | Pin to `calc(30px × layout-scale)` — exact half of the 60px beam |
| **Portrait card `--conch-scale-y` formula** | Old `* 0.72` multiplier made card too short when conch-scale moved to width axis | Replaced with `calc(layout-scale × 1.35)` so max-height stays ~330 px on 393 px phones |
| **Portrait card width base `450px`** | At `vw/886` scale, `450 × 0.44 = 198 px` — narrower than 50 % of viewport | Changed to `886px` base so `min(90%, 886 × vw/886) = min(90%, vw)` always = 90 % |

### Changes Made

In [src/main.js](file:///f:/NAK-MVP/src/main.js):
1. **`updateLayoutScale()`**: Reads `visualViewport.width/height` directly. Uses `vw / 1920` for `--layout-scale`. In portrait, uses `vw / 886` (floors 0.35) for `--conch-scale`; in landscape, keeps `containerH / 900`.

In [src/style.css](file:///f:/NAK-MVP/src/style.css):
2. **`.hud-brand-container`** base: `top: 3.7%` → `calc(30px * var(--layout-scale, 1))`. `gap: 12px` → `calc(12px * var(--layout-scale, 1))`.
3. **Portrait `.canvas-container`**: `max-width` changed from `100vh` to `100svh` (stable viewport height). `--conch-scale-y` changed from `var(--conch-scale) * 0.72` to `var(--layout-scale) * 1.35`.
4. **Portrait `.hud-brand-container`**: Center point corrected from `57px` → `50.5px * hud-scale` (exact middle of the 101 px wooden beam).
5. **Portrait `.ask-conch-overlay`**: Width base `450px` → `886px`. Max-height base `480px` → `750px`.

### Verification Results

````carousel
![iPhone 15 Portrait (500×757)](C:/Users/Alejandro/.gemini/antigravity-ide/brain/f32141bb-fab8-4389-a986-5cc154cbe2c2/iphone_15_portrait_1783462594073.png)
<!-- slide -->
![Tablet Portrait (752×929)](C:/Users/Alejandro/.gemini/antigravity-ide/brain/f32141bb-fab8-4389-a986-5cc154cbe2c2/tablet_portrait_1783462656072.png)
<!-- slide -->
![Desktop Landscape (1920×953)](C:/Users/Alejandro/.gemini/antigravity-ide/brain/f32141bb-fab8-4389-a986-5cc154cbe2c2/desktop_landscape_1783462684460.png)
<!-- slide -->
![Desktop Narrow Portrait (684×705)](C:/Users/Alejandro/.gemini/antigravity-ide/brain/f32141bb-fab8-4389-a986-5cc154cbe2c2/desktop_narrow_1783462710481.png)
````

---

## 12. Constant Portrait Camera FOV & Dynamic Scroll Container Sizing

To handle screens of different vertical heights in portrait mode without losing or misaligning the 3D HUD banner (`tabla_hud`) and to prevent the Ask the Conch card from getting clipped, we implemented two enhancements:

### A. Restored Constant vertical FOV for Portrait Camera
* **Problem**: Using Hor+ camera fitting with calculated horizontal angles in portrait mode caused the camera to zoom in on wider/shorter mobile screens. This pushed the 3D wooden banner (`tabla_hud` mesh) completely off-screen, making it disappear.
* **Fix**: Restored the constant vertical FOV (`25.36°`) inside [src/main.js](file:///f:/NAK-MVP/src/main.js) for `Scene_Vertical.glb`.
* **Result**: The 3D wooden banner (`tabla_hud` mesh) is back, stays locked exactly at the top of the viewport, and matches the HTML logo/text overlay perfectly across all phone aspect ratios.

### B. Dynamic Scroll Container Height (No Card Clipping)
* **Problem**: Constraining the max-height of the outer `.ask-conch-overlay` container on shorter screens caused the card to be clipped, cutting off the bottom yellow border and the "BURN" button.
* **Fix**:
  1. Set `.ask-conch-overlay` to have a max-height of `calc(500px * var(--conch-scale-y, 1))` to preserve the perfect look on standard screens.
  2. Applied the dynamic height constraint directly to the **radio group question list container (`.scroll-container`)** inside [src/style.css](file:///f:/NAK-MVP/src/style.css) with an increased safety margin of `380px`:
     ```css
     .scroll-container {
       max-height: min(
         calc(290px * var(--conch-scale-y, 1)),
         calc(100svh - calc(calc(200px * var(--hud-scale, 1)) + env(safe-area-inset-top, 0px)) - calc(175px * var(--conch-scale-y, 1)) - 380px)
       );
     }
     ```
* **Result**: The outer card yellow container is **never clipped** and the button is always fully visible with its bottom safe margin. If the screen is short, the list of questions automatically shrinks (starting on any screen height below 760px), activating the internal scrollbar to fit the viewport while leaving exactly `380px` of space for the 3D conch shell below.

### C. Synchronized 3D HUD Banner Scaling (No Shrinking Below Floor)
* **Problem**: When screen width shrinks below `672px`, the HTML HUD elements (logos, text, and Connect Wallet button) are held constant at a floor scale of `0.35` to preserve legibility. However, the WebGL/WebGPU 3D canvas continues to scale down linearly. This caused the 3D wooden HUD banner (`tabla_hud` meshes) to shrink while the HTML elements overlaying it remained larger, resulting in a layout mismatch.
* **Fix**: Added dynamic scale compensation in [src/main.js](file:///f:/NAK-MVP/src/main.js). We track all meshes starting with `tabla_hud` in `tablaHudMeshes` and scale them up in 3D by the `appliedScale / actualScale` mismatch ratio during window resize.
* **Result**: The 3D wooden banner matches the HTML scale floor exactly. It never shrinks below the `0.35` layout scale floor, keeping the wooden banner perfectly aligned behind the text and buttons on narrow viewports.

---

## 13. Unified HUD Navbar: 2D Wooden Banner Background

To completely resolve camera projection and vertical alignment challenges for the HUD banner across all orientations:

* **3D HUD Hide (All Orientations)**: Modified the 3D loader and resize handler in [src/main.js](file:///f:/NAK-MVP/src/main.js) to set `visible = false` on all 3D meshes whose names start with `tabla_hud` for both landscape/desktop and portrait/mobile orientations.
* **2D HTML Banner Backdrop**: Inside [src/style.css](file:///f:/NAK-MVP/src/style.css), we styled the `.top-hud-bar` element in both global (landscape) rules and portrait media query overrides with the `/tablawebp.webp` background.
* **Separated Tuning Parameters**: 
  - Landscape defaults to `height: calc(60px * var(--layout-scale, 1))` and `background-size: 100% 100%`.
  - Portrait overrides default to `height: calc(calc(101px * var(--hud-scale, 1)) + env(safe-area-inset-top, 0px))` and `background-size: 100% 135%`.
* **Result**: The top navbar scales perfectly dynamically with the HTML logo and button on all screen sizes and ratios, completely free from 3D camera projection and resolution mismatches.


---

## 14. Disabled Wood Button Opacity Leak Resolution

To prevent underlying card backgrounds from leaking through the wooden buttons when they are disabled:

* **Removed Container Opacity**: Changed `.wood-btn:disabled` opacity from `0.65` to `1.0` in [src/style.css](file:///f:/NAK-MVP/src/style.css) so the button container remains fully opaque and blocks the background yellow texture from bleeding through the button.
* **Transparent Background & Texture Alignment**:
  * Set `background-color: transparent` (instead of `#845226`) on `.wood-btn::before` for both active and disabled states.
  * Replaced `background-size: 200% 200%` and `background-position: 25% 50%` with `background-size: cover` and `background-position: center`. The old settings zoomed in on the far-left dark/shaded corner of the `/tablawebp.webp` banner render, while the new values align it directly to the lighter, warm-colored middle section of the banner.
  * Styled the disabled button to use `filter: contrast(0.8) saturate(0.9)` and disabled text to `rgba(255, 255, 255, 0.65)`.
* **Result**: Both the top navbar and wood buttons now share the exact same warm wood color tones since they display the same regions of the shared `/tablawebp.webp` file.

---

## 15. Mobile Portrait: Conch Card Height & Vertical Spacing Optimization

To optimize the vertical layout on mobile devices (such as the iPhone 16) and prevent the card overlay from appearing too tiny:

* **Pushed Overlay Upward with Comfortable Margin**: Changed `.ask-conch-overlay` `top` offset in portrait mode from `200px` to `135px * var(--hud-scale, 1) + env(safe-area-inset-top)`. This reduces the empty blue gap below the top banner while maintaining a clean, spacious margin.
* **Increased Scale Multipliers**: Changed portrait vertical scale modifiers in [src/style.css](file:///f:/NAK-MVP/src/style.css):
  - `--conch-scale-y` changed from `0.72` to `0.88` to prevent aggressive height squishing.
  - `--conch-font-scale` changed from `0.78` to `0.85` for better text readability.
* **Strict Bottom Safe Zone (`420px` Clearance)**: Refactored height limits to constrain the overlay `.ask-conch-overlay` directly with `max-height: calc(100svh - top - 420px)`. This guarantees a minimum of 420px of unoccupied vertical space at the bottom of the screen to secure the 3D conch shell from overlap.
* **Flexbox Min-Height Fix**: Added `min-height: 0;` to `.conch-card`, `.card-state-container`, and `.scroll-container`. This resolves a nested CSS flexbox overflow bug (where flex elements default to `min-height: auto` and refuse to shrink below their content size), forcing the list container to shrink gracefully and enable scrolling inside the card.
* **Result**: The conch card expands naturally to fill tall screens but shrinks reliably on shorter displays to protect the conch safe zone from any visual overlaps.

---

## 16. Interactive Floating Token Bubbles (Top Gainers & Losers)

To display live market trends in an engaging, underwater-themed visual widget:

* **HTML Structure**: Added `#bubbles-container` in [index.html](file:///f:/NAK-MVP/index.html) immediately after the WebGL canvas.
* **Buoyancy & Oscillating Physics (Sinusoidal Drift)**: Created layered CSS transitions in [style.css](file:///f:/NAK-MVP/src/style.css):
  - **Outer Rise Layer (`.bubble-item`)**: Floats up vertically from off-screen bottom to off-screen top (`translateY(0)` to `translateY(calc(-100vh - 200px))`) at a constant linear speed.
  - **Inner Sway Layer (`.bubble-inner`)**: Alternates sways horizontally back and forth using an `ease-in-out` sinusoidal ease to mimic bubble physics.
  - **Hover Interactivity**: Nested the hover state to pause both the rise and sway keyframe animations (`animation-play-state: paused`) and scale the token graphic (`transform: scale(1.15)`) smoothly.
* **DOM Spawning & Multi-Layer z-index**:
  - Leveraged `z-index: 50` on the container, placing the bubbles in front of the 3D canvas but behind the top wooden banner and Ask the Conch card.
  - Allowed clicks/hovers on empty spaces to pass through to the 3D scene using `pointer-events: none` on the container and `pointer-events: auto` on bubble elements.
* **Ecosystem API Integration**:
  - Implemented `fetchTokenData()` in [main.js](file:///f:/NAK-MVP/src/main.js) to pull active tokens from `icptokens.net` API.
  - Deduped and filtered out stablecoins, sorted by 24h USD change, and loaded the top 3 gainers and top 3 losers (6 total bubbles).
  - Used `logo` filenames to construct image sources (`https://icptokens.net/storage/${logo}`) and added an `onerror` fallback.
  - Added click navigation to open token details in new tabs.
  - Integrated robust error handling with pre-configured static fallbacks (using the default logo Frame) if the network is offline.
  - Solved race conditions using an `isBenchmarkFinished` synchronization flag so bubbles spawn automatically at the end of the preloader entrance animation.
* **Result**: The portal features interactive, floating bubble price indicators that float up in non-uniform waves, pause on hover, navigate on click, and maintain perfect layer depth.








