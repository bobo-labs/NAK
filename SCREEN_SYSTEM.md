# Screen & Camera System — NAK MVP

> Last updated: 2026-07-01  
> Files: `src/style.css`, `src/main.js`

---

## Overview

The app renders a 3D scene (Blender → Three.js WebGPU) that needs to match the Blender camera's framing exactly at every screen size, while overlaying HTML/CSS HUD interface elements (logos, titles, wallet buttons, and pop-up cards) that scale proportionally.

The system layers:

```
Browser Window
  └─ #app  (100vw × 100vh, black background)
       └─ .canvas-container  (aspect-locked to 1920×953, receives --layout-scale)
            ├─ <canvas>  (100% × 100%, internal render buffer stepped)
            ├─ .top-hud-bar  (scales with --layout-scale)
            ├─ .hud-brand-container  (scales with --layout-scale)
            └─ .ask-conch-overlay  (scales with --conch-scale)
```

Black areas that appear outside `.canvas-container` come from `#app`'s black background — they are **not** part of the 3D scene.

---

## 1. Blender Source Camera

| Property | Value |
|---|---|
| Render resolution | 1920 × 900 px |
| Horizontal FOV (lens) | **25.4°** |
| Vertical FOV (at 1920×900) | ~12.04° |
| Aspect ratio | 2.1333 : 1 |

> **Important:** The GLTF/GLB format stores the camera as a **vertical FOV** (`yfov`). Three.js `PerspectiveCamera.fov` is also a vertical value. The authoritative source of truth is the **horizontal FOV (25.4°)** as shown in Blender's lens panel — we use this to recompute the correct VFOV for every viewport size.

---

## 2. CSS Container Lock

**File:** `src/style.css` — `.canvas-container`

```css
/* Landscape aspect lock (1920x953) */
.canvas-container {
  width: 100%;
  height: 100%;
  max-height: calc(100vw * 953 / 1920);
}

/* Portrait aspect lock (886x1920) */
@media (orientation: portrait) {
  .canvas-container {
    max-height: calc(100vw * 1920 / 886);
    max-width: calc(100vh * 886 / 1920);
  }
}
```

### Why 953 px / 886 px?
- **Landscape**: The canonical display is **1920 × 953** (taking Chrome window menus into account).
- **Portrait**: The target aspect ratio is **886 × 1920** (iPhone's standard 9:19.5 aspect ratio).

### Behavior at different viewport sizes
The container **always locks to its target aspect ratio** depending on screen orientation. In landscape mode, width fills the screen while height is capped. In portrait mode, height fills the screen while width is capped. Black letterboxing/pillarboxing fills any remaining space.

---

## 3. Three.js Camera Setup

**File:** `src/main.js`

### Constants

```js
const DESIGN_HFOV_DEG = 25.4; // Blender lens → horizontal FOV
```

### On GLB load (one-time) and Resize (`onWindowResize`)
Camera aspect ratio and dynamic VFOV are updated as:

```js
const aspect   = containerW / containerH;         // from mathematical getContainerSize()
const hHalfRad = THREE.MathUtils.degToRad(DESIGN_HFOV_DEG / 2);
const vFovDeg  = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalfRad) / aspect));

camera.aspect = aspect;
camera.fov    = vFovDeg;
camera.updateProjectionMatrix();
```

**Effect:** Horizontal framing (`25.4°`) is **constant** at every screen size. Vertical framing expands or contracts slightly if the aspect ratio differs from 2.1333:1. This is the same behavior as Blender's "Horizontal" camera sensor fit.

---

## 4. Unified UI Scaling System

To make all HTML overlays downscale and upscale proportionally together, we use a single CSS custom property **`--layout-scale`** injected into the container by Javascript during the resize handler.

### Calculation
Rather than scaling from container height (which collapses in portrait/narrow screens and causes text to shrink to unreadable sizes), the layout scale is derived from **container width** (which is always equal to the viewport width):

```js
function updateLayoutScale(containerW, containerH) {
  // Reference width is 1920px (standard design). Floor at 0.35 to maintain legibility.
  const scale = Math.max(0.35, containerW / 1920);
  canvasContainer.style.setProperty('--layout-scale', scale);

  // Conch card still uses height-based scale to fit vertically within the viewport.
  if (askConchOverlay) {
    const cardScale = Math.max(0.6, Math.min(1.5, containerH / 900));
    askConchOverlay.style.setProperty('--conch-scale', cardScale);
  }
}
```

### CSS Consumption
HUD elements consume `--layout-scale` using CSS `calc()` formulas. We use `clamp()` on fonts and icons to ensure they don't scale below a readable threshold:

#### A. Top HUD Bar
The wooden banner height and margins scale proportionally:
```css
.top-hud-bar {
  height: calc(60px * var(--layout-scale, 1));
  padding: 0 calc(24px * var(--layout-scale, 1));
}
```

#### B. Brand Container ($NAK logo & Icon)
```css
.hud-brand-container {
  gap: calc(12px * var(--layout-scale, 1));
  transform: translate(calc(10px * var(--layout-scale, 1)), -50%);
}
.hud-icon-btn {
  width: clamp(15px, calc(50px * var(--layout-scale, 1)), 50px);
  height: clamp(15px, calc(50px * var(--layout-scale, 1)), 50px);
}
.hud-logo-text-nak {
  font-size: clamp(12px, calc(40px * var(--layout-scale, 1)), 40px);
  text-shadow: calc(2px * var(--layout-scale, 1)) calc(2px * var(--layout-scale, 1)) 0px #1a0d07;
}
```

#### C. Connect Wallet Button & Dropdown
Paddings, borders, shadow depths, offsets, and font sizes scale together:
```css
.wallet-connect-wrapper {
  transform: translate(calc(-1 * calc(24px * var(--layout-scale, 1))), -50%);
}
.wallet-connect-btn {
  border: calc(3px * var(--layout-scale, 1)) solid #3c2312;
  font-size: clamp(10px, calc(16px * var(--layout-scale, 1)), 16px);
  padding: calc(8px * var(--layout-scale, 1)) calc(18px * var(--layout-scale, 1));
  box-shadow: 0 calc(4px * var(--layout-scale, 1)) 0px #3c2312;
}
.wallet-dropdown {
  top: calc(52px * var(--layout-scale, 1));
  width: calc(250px * var(--layout-scale, 1));
  border: calc(3px * var(--layout-scale, 1)) solid #3c2312;
  border-radius: calc(16px * var(--layout-scale, 1));
}
```

---

## 5. Render Buffer (Internal Resolution)

The canvas CSS is always `100% × 100%` of the container, but the **internal WebGPU render buffer** uses stepped resolutions for performance. Heights are computed proportionally to the **actual container aspect** (no fixed height assumed).

```js
function getRenderResolution(containerW, containerH) {
  if (containerW >= 1280) return { w: 1920, h: round(1920 * containerH / containerW) };
  if (containerW >= 1024) return { w: 1280, h: round(1280 * containerH / containerW) };
  return                         { w: 1024, h: round(1024 * containerH / containerW) };
}
```

---

## 6. "Pull the Cord" Button

This button **is** 3D-projected every frame (`updateButtonPosition`). It tracks `hudPlane` — an invisible mesh inside the GLB anchored at the cord pull point.

```js
hudPlane.getWorldPosition(worldPos);
worldPos.project(activeCamera);  // → NDC [-1, 1]

btn.style.left = `${(ndcX * 0.5 + 0.5) * containerW}px`;
btn.style.top  = `${(ndcY * -0.5 + 0.5) * containerH}px`;
```

---

## 7. Resize Flow Diagram

```
window 'resize' event
  └─ debounced 100 ms
       └─ onWindowResize()
            ├─ getContainerSize()  →  { w, h } from DOM size logic (no DOM queries)
            ├─ aspect  = w / h
            ├─ vFovDeg = 2·atan(tan(12.7°) / aspect)
            ├─ activeCamera.fov = vFovDeg
            ├─ activeCamera.aspect = aspect
            ├─ hudCamera.fov/aspect  (HUD overlay camera)
            ├─ getRenderResolution(w, h)  →  stepped buffer size
            ├─ renderer.setSize(buf.w, buf.h, false)
            ├─ bgMeshes → reset to original Blender scale
            ├─ updateLayoutScale(w, h)  →  Injects --layout-scale and --conch-scale
            └─ updateButtonPosition()  →  re-project cord button
```

---

## 9. Portrait / Mobile Screen System (`Scene_Vertical.glb`)

To support native portrait mobile viewports (e.g. iPhone 14 Pro), the system swaps the active scene assets and adjusts camera framing and element layouts dynamically on window resize:

### A. Dynamic Scene Swapping
* **Orientation Detection**: Inside `onWindowResize()`, the system checks `window.innerWidth < window.innerHeight` to determine the viewport state.
* **Asset Loading**: If the orientation has changed, the system triggers `loadModel()` to swap assets between `Scene_Desktop.glb` (landscape) and `Scene_Vertical.glb` (portrait).
* **WebGL Memory Management**: The loader automatically disposes of old geometries, materials, and textures when loading the new scene to avoid memory leaks or duplicate rendering contexts.

### B. Aspect Ratio Lock (886x1920)
* To prevent portrait model stretching, `.canvas-container` locks aspect ratio to `886/1920` (iPhone's `9:19.5` ratio) in CSS.
* When resizing, the render buffer sizing function `applyQualityProfile()` queries `getRenderResolution(size.w, size.h)` passing both width and height, preserving the aspect ratio constraints:
  ```js
  function getRenderResolution(containerW, containerH) {
    if (containerW >= 1280) return { w: 1920, h: round(1920 * containerH / containerW) };
    return { w: 1024, h: round(1024 * containerH / containerW) };
  }
  ```

### C. Camera Fitting Models (Hor+ vs Vert+)
* **Landscape (Hor+ Fitting)**: Preserves horizontal framing (constant HFOV = `25.4°`). Camera vertical FOV is calculated contextually as a function of the aspect ratio.
* **Portrait (Vert+ Fitting)**: Preserves vertical framing (constant VFOV = `25.36°`). This matches the vertical composition of `Scene_Vertical.glb` and keeps the conch shell model perfectly scaled inside the narrow layout.

### D. Decoupled Responsive HUD System
To prevent layout changes in mobile viewports from shifting or breaking the desktop/landscape portal design, the CSS rules are completely decoupled:
* **Landscape Mode (Base)**: Elements like `.hud-brand-container`, `.top-hud-bar`, and `.wallet-connect-wrapper` scale with `--layout-scale` and position at `top: 3.7%` and `top: 56%` respectively.
* **Portrait Mode (Media Query Override)**:
  * Inside `@media (orientation: portrait)`, scale variables (`--hud-scale`, `--conch-scale-y`, `--conch-font-scale`) are overridden directly on `.canvas-container` so they inherit the inline `--layout-scale` context:
    ```css
    --hud-scale: calc(var(--layout-scale, 1) * 1.35); /* 35% larger HUD */
    --conch-scale-y: calc(var(--conch-scale, 1) * 0.72); /* 28% more compact card */
    --conch-font-scale: calc(var(--conch-scale, 1) * 0.78); /* 22% smaller card fonts */
    ```
  * **Wooden Beam Centering**: Both the brand container (`top: calc(85px * var(--hud-scale))`) and the wallet connect button wrapper (`top: 50%` inside a `calc(170px * var(--hud-scale))` taller HUD bar) align on the exact same vertical center line. This sits them perfectly centered in the middle of the 3D mobile wooden banner beam without cropping at the top of the canvas viewport.
  * **HUD Mesh Layer Separation**: In `Scene_Vertical.glb`, the banner is composed of multiple sub-meshes (`tabla_hud` and `tabla_hud002`). The model traverse uses `.startsWith('tabla_hud')` to target all components and assign them to Layer 1, completely excluding them from post-processing depth of field blur and keeping the entire frame 100% sharp.
  * **Card Offset Clearing**: The conch oracle card overlay shifts its top anchor down (`top: calc(185px * var(--hud-scale))`) to sit below the taller HUD bar with a balanced gap.

---

## 10. FAQ / Gotchas

**Q: Why not just lock the container to `aspect-ratio: 1920 / 953` in CSS?**  
A: The browser places letterbox bars that are part of the container's layout, but the canvas then renders inside a smaller box. Reading `clientHeight` after a CSS aspect-ratio lock returns the padded height, not the rendered scene height. The `max-height` approach gives us reliable `clientWidth` / `clientHeight` values that exactly match the rendered scene.

**Q: Why does the VFOV change slightly at other screen sizes?**  
A: We preserve the **horizontal FOV** (25.4°) as the constant. This is how Blender's "Horizontal" sensor fit works. On a wider viewport, slightly more vertical content is revealed; on a narrower viewport, slightly less. The horizontal framing (left seaweed to right seaweed) is always identical to the Blender render.

**Q: How do I change the target resolution?**  
1. Update `max-height: calc(100vw * <H> / <W>)` in `.canvas-container` (CSS).
2. Update `(1920 / 953)` fallbacks in `getContainerSize` and `onWindowResize` (JS).
3. Update `DESIGN_HFOV_DEG` if the Blender lens FOV changes.
4. Update `getRenderResolution` step thresholds if needed.

