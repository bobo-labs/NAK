# Screen & Camera System — NAK MVP

> Last updated: 2026-06-23  
> Files: `src/style.css`, `src/main.js`

---

## Overview

The app renders a 3D scene (Blender → Three.js WebGPU) that needs to match the Blender
camera's framing exactly at every screen size. The system has three layers:

```
Browser Window
  └─ #app  (100vw × 100vh, black background)
       └─ .canvas-container  (aspect-locked to 1920×953)
            └─ <canvas>  (100% × 100%, internal render buffer stepped)
```

Black areas that appear outside `.canvas-container` come from `#app`'s black background — they
are **not** part of the 3D scene.

---

## 1. Blender Source Camera

| Property | Value |
|---|---|
| Render resolution | 1920 × 900 px |
| Horizontal FOV (lens) | **25.4°** |
| Vertical FOV (at 1920×900) | ~12.04° |
| Aspect ratio | 2.1333 : 1 |

> **Important:** The GLTF/GLB format stores the camera as a **vertical FOV** (`yfov`).  
> Three.js `PerspectiveCamera.fov` is also a vertical value.  
> The authoritative value is the **horizontal FOV (25.4°)** as shown in Blender's lens panel —
> we use this to recompute the correct VFOV for every viewport size.

---

## 2. CSS Container Lock

**File:** `src/style.css` — `.canvas-container`

```css
.canvas-container {
  width: 100%;
  height: 100%;
  max-height: calc(100vw * 953 / 1920);
}
```

### Why 953 px?
The target display is **1920 × 1080** with a browser chrome (address bar + tab bar) of ~127 px,
leaving **1920 × 953** as the usable viewport. This is the canonical web resolution.

### Behavior at different viewport sizes

| Viewport | Container | Black bars |
|---|---|---|
| 1920 × 953 | 1920 × 953 | None (perfect fit) |
| 2560 × 1440 | 2560 × 1271 | ~85 px top + bottom |
| 1920 × 1080 | 1920 × 953 | ~64 px top + bottom |
| 1280 × 800 | 1280 × 635 | ~83 px top + bottom |
| 800 × 600 (portrait-ish) | 800 × 397 | ~102 px top + bottom |

The container **always fills the full viewport width**. Height is capped so the landscape
aspect is never broken. Bars appear below the container (black `#app` background).

---

## 3. Three.js Camera Setup

**File:** `src/main.js`

### Constants

```js
const DESIGN_HFOV_DEG = 25.4; // Blender lens → horizontal FOV
```

### On GLB load (one-time)

```js
const _initAspect  = containerW / containerH;
const _hHalfRad    = THREE.MathUtils.degToRad(DESIGN_HFOV_DEG / 2);
const _initVFov    = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(_hHalfRad) / _initAspect));

activeCamera.fov    = _initVFov;
activeCamera.aspect = _initAspect;
activeCamera.updateProjectionMatrix();
```

### On every resize (`onWindowResize`)

```js
const aspect   = containerW / containerH;         // from actual DOM clientWidth/Height
const hHalfRad = THREE.MathUtils.degToRad(DESIGN_HFOV_DEG / 2);
const vFovDeg  = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalfRad) / aspect));

camera.fov    = vFovDeg;
camera.aspect = aspect;
camera.updateProjectionMatrix();
```

**Effect:** Horizontal framing (`25.4°`) is **constant** at every screen size. Vertical
framing expands or contracts slightly if the aspect ratio differs from 2.1333:1. This is
the same behavior as Blender's "Horizontal" camera sensor fit.

### VFOV at key resolutions

| Viewport | Aspect | VFOV |
|---|---|---|
| 1920 × 953 (target) | 2.014 | 12.76° |
| 1920 × 900 (Blender) | 2.133 | 12.04° |
| 1920 × 1080 | 1.778 | 14.43° |
| 1280 × 635 | 2.016 | 12.74° |

---

## 4. Render Buffer (Internal Resolution)

The canvas CSS is always `100% × 100%` of the container, but the **internal WebGPU render
buffer** uses stepped resolutions for performance. Heights are computed proportionally to
the **actual container aspect** (no fixed height assumed).

```js
function getRenderResolution(containerW, containerH) {
  if (containerW >= 1280) return { w: 1920, h: round(1920 * containerH / containerW) };
  if (containerW >= 1024) return { w: 1280, h: round(1280 * containerH / containerW) };
  return                         { w: 1024, h: round(1024 * containerH / containerW) };
}
```

| Container width | Render buffer | At 1920×953 |
|---|---|---|
| ≥ 1280 px | 1920 × proportional | **1920 × 953** |
| 1024–1279 px | 1280 × proportional | 1280 × 635 |
| < 1024 px | 1024 × proportional | 1024 × 508 |

The canvas element itself is CSS-scaled to fill the container (`width: 100%; height: 100%`),
so the GPU buffer and the display area are always the same aspect.

---

## 5. HUD Icon (Top-Left)

The icon (`#hud-icon-btn`) is **CSS-anchored** — it does NOT use 3D-to-2D projection.

```css
.hud-icon-btn {
  position: absolute;
  top: 0;
  left: 0;
  /* JS sets --hud-icon-size and --hud-icon-offset via updateIconScale() */
  width:  var(--hud-icon-size,   50px);
  height: var(--hud-icon-size,   50px);
  transform: translate(
    var(--hud-icon-offset, 10px),
    var(--hud-icon-offset, 10px)
  );
}
```

`updateIconScale(containerH)` scales the icon proportionally to the container height,
using **900 px** as the reference (original Blender design height):

```js
const scale  = containerH / 900;
const size   = clamp(50 * scale, 15, 150);   // px
const offset = clamp(10 * scale,  2,  30);   // px
```

| Container height | Icon size | Inset offset |
|---|---|---|
| 900 px (Blender) | 50 px | 10 px |
| 953 px (target) | 52.9 px | 10.6 px |
| 635 px (1280 wide) | 35.3 px | 7.1 px |

---

## 6. "Pull the Cord" Button

This button **is** 3D-projected every frame (`updateButtonPosition`). It tracks
`hudPlane` — an invisible mesh inside the GLB anchored at the cord pull point.

```js
hudPlane.getWorldPosition(worldPos);
worldPos.project(activeCamera);  // → NDC [-1, 1]

btn.style.left = `${(ndcX * 0.5 + 0.5) * containerW}px`;
btn.style.top  = `${(ndcY * -0.5 + 0.5) * containerH}px`;
```

The button's CSS then centers itself on that point:
```css
transform: translate(-50%, -50%);
```

---

## 7. Resize Flow

```
window 'resize' event
  └─ debounced 100 ms
       └─ onWindowResize()
            ├─ getContainerSize()  →  { w, h } from DOM clientWidth/Height
            ├─ aspect  = w / h
            ├─ vFovDeg = 2·atan(tan(12.7°) / aspect)
            ├─ activeCamera.fov = vFovDeg
            ├─ activeCamera.aspect = aspect
            ├─ hudCamera.fov/aspect  (post-processing HUD mask camera)
            ├─ getRenderResolution(w, h)  →  stepped buffer size
            ├─ renderer.setSize(buf.w, buf.h, false)
            ├─ bgMeshes → reset to original Blender scale
            ├─ updateIconScale(h)  →  CSS vars --hud-icon-size / --hud-icon-offset
            └─ updateButtonPosition()  →  re-project cord button
```

---

## 8. FAQ / Gotchas

**Q: Why not just lock the container to `aspect-ratio: 1920 / 953` in CSS?**  
A: We tried this. The browser places letterbox bars that are part of the container's
layout, but the canvas then renders inside a smaller box. Reading `clientHeight` after
a CSS aspect-ratio lock returns the padded height, not the rendered scene height.
The `max-height` approach gives us reliable `clientWidth` / `clientHeight` values
that exactly match the rendered scene.

**Q: Why does the VFOV change slightly at other screen sizes?**  
A: We preserve the **horizontal FOV** (25.4°) as the constant. This is how Blender's
"Horizontal" sensor fit works. On a wider viewport, slightly more vertical content is
revealed; on a narrower viewport, slightly less. The horizontal framing (left seaweed
to right seaweed) is always identical to the Blender render.

**Q: What if I re-export the GLB at 1920×953?**  
The GLTF `yfov` would then be `12.76°` (instead of `12.04°` for 1920×900). The code
ignores the GLTF yfov entirely and recomputes from `DESIGN_HFOV_DEG = 25.4`, so
the visual result would be **identical**. Re-exporting is optional.

**Q: How do I change the target resolution?**  
1. Update `max-height: calc(100vw * <H> / <W>)` in `.canvas-container` (CSS).
2. Update `(1920 / 953)` fallbacks in `getContainerSize` and `onWindowResize` (JS).
3. Update `DESIGN_HFOV_DEG` if the Blender lens FOV changes.
4. Update `getRenderResolution` step thresholds if needed.
