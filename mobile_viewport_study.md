# Mobile Viewport & System UI Clearance Analysis

This study evaluates the interaction between mobile system chrome (status bars, notches, browser address bars, and home indicators) and the NAK-MVP Web3 interactive portal. It details the root causes of mobile viewport sizing issues, reviews standard industry solutions, and provides a clear integration plan to ensure a premium, system-aware layout on iOS and Android.

---

## 1. Core Viewport Challenges on Mobile

Mobile browsers operate within a complex layout environment where the viewport boundaries are constantly fighting with system overlays:

```
+----------------------------------------+
| [   Battery / Wifi / Status Bar   ]    | <-- Clipped by safe-area-inset-top
| [   Notch / Dynamic Island / Punch ]   |
+----------------------------------------+
|                                        |
|         Browser Address Bar            | <-- Expands/collapses on scroll
|                                        |
+----------------------------------------+
|                                        |
|                                        |
|         Interactive 3D Scene           |
|                                        |
|                                        |
+----------------------------------------+
|                                        |
|         Bottom Navigation Bar          | <-- Often covers bottom actions
|                                        |
+----------------------------------------+
| [  Home Swipe Indicator / Bezel  ]     | <-- Clipped by safe-area-inset-bottom
+----------------------------------------+
```

### A. The `100vh` Layout Overlap
Historically, mobile Safari and Chrome defined `100vh` as the height of the screen **excluding the browser's address bar and navigation bar in their retracted states**. When these bars are expanded (the default on page load), a `100vh` container is taller than the visible viewport, causing the bottom portion of the container to slide behind the browser's navigation toolbar.

### B. Jarring Resizes on Scroll
When a user scrolls or drags on a canvas, the browser's address bar shrinks or expands. If a layout relies on window resize events (`window.innerHeight`), it triggers continuous re-calculations, causing the 3D canvas and model to scale or reload dynamically, resulting in distracting visual jumps.

### C. Notch & Punch-Hole Clipping
Bezel-less devices (e.g. iPhone 13/14/15/16, modern Androids) have physical cutouts (notches or dynamic islands). If the interactive app fills the page, layout elements positioned at the top left/right (like the logo or Connect Wallet wrapper) can easily get clipped or covered by the camera cutout.

### D. Home Indicator Touch Interference
Bottom swipe indicators (the home bar on bezel-less phones) sit on top of the web content. If buttons or trigger overlays are too close to the bottom edge, user taps can trigger the system's "go home" or "switch apps" gesture, causing friction.

---

## 2. Current Status of NAK-MVP

* **Height Declaration**: The `body` and `#app` elements in [style.css](file:///f:/NAK-MVP/src/style.css#L26-L49) use hardcoded `100vh`. This pushes the bottom of the canvas and elements underneath bottom toolbars on iOS/Android.
* **Canvas Fitting**: The canvas is scale-locked to `1920x953` (landscape) or `886x1920` (portrait) inside `.canvas-container`. If the viewport shrinks due to the address bar, the container is letterboxed, but the positioning variables for HUD overlays are offset relative to the full container size.
* **Notches / Status Bars**: HUD elements (logo, Connect Wallet button) sit exactly at the top of the canvas without any top padding offsets. On notch-equipped devices, these elements are pushed into the camera area.

---

## 3. Industry-Standard Solutions

### A. Modern Viewport Units (`svh`, `lvh`, `dvh`)
CSS Values and Units Module Level 4 introduced three viewport height definitions:
* **`svh` (Small Viewport Height)**: The visible screen area when browser chrome is fully expanded (safest, most static height).
* **`lvh` (Large Viewport Height)**: The visible screen area when browser chrome is fully retracted (identical to classic `vh`).
* **`dvh` (Dynamic Viewport Height)**: The active height that changes dynamically in real-time as the chrome expands/retracts.

> [!TIP]
> **Use Case Recommendation**: For static, app-like 3D portals where we want to avoid layout jumps on scroll while filling the screen, **`100svh`** is the cleanest solution because it provides a reliable canvas area that never gets covered by dynamic bars.

### B. Safe Area Environment Variables (`safe-area-inset-*`)
Introduced to handle Apple's notches, safe area variables let CSS query the exact physical safe boundary of the device's screen:
* Required meta viewport: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
* Padding usage: `padding-top: env(safe-area-inset-top);`

### C. VisualViewport API
In JavaScript, the `window.visualViewport` object represents the actual visual area of the page. It reports accurate `width` and `height` dimensions, excluding keyboard overlays and address bars, and triggers a `resize` event specifically when the visual frame shifts.

---

## 4. Proposed Architectural Plan

To resolve viewport and cutout overlaps while maintaining a highly polished experience:

### Phase 1: CSS Viewport Stabilization
Re-style the root containers in [style.css](file:///f:/NAK-MVP/src/style.css) to support both fallback rules and modern viewport properties.
```css
body, #app {
  height: 100vh; /* Fallback for legacy browsers */
  height: 100svh; /* Locks height to visible screen area excluding dynamic toolbars */
  width: 100vw;
  width: 100dvw;
}
```

### Phase 2: Notch and Punch-Hole Spacing
Ensure the HTML header allows content to flow behind notches, then insert safe-area offsets using padding adjustments:
1. **Viewport Tag Upgrade**: In [index.html](file:///f:/NAK-MVP/index.html), add `viewport-fit=cover` to the meta tag:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
   ```
2. **Top HUD Bar Padding**: In [style.css](file:///f:/NAK-MVP/src/style.css), increase the height/padding of `.top-hud-bar` using safe-area offsets, shifting the elements down slightly on notched devices:
   ```css
   .top-hud-bar {
     padding-top: max(env(safe-area-inset-top), 10px);
   }
   ```

### Phase 3: Bottom Gesture & Interaction Spacing
For bottom overlay cards or elements (like the Conch card footer or pull cords), insert bottom safe-area clearings:
```css
.canvas-container {
  padding-bottom: env(safe-area-inset-bottom);
}
```

### Phase 4: Prevent Scroll Jumps in JS
Update `getContainerSize()` in [src/main.js](file:///f:/NAK-MVP/src/main.js) to leverage the VisualViewport width/height when available, or fall back to standard dimensions. This ensures that calculations for the 3D WebGPU renderer resolution remain perfectly stable even if address bars toggle state:
```javascript
function getContainerSize() {
  // Use visualViewport if available for accurate visible viewport dimensions
  const w = (window.visualViewport ? window.visualViewport.width : window.innerWidth) || 1920;
  const h = (window.visualViewport ? window.visualViewport.height : window.innerHeight) || 953;
  ...
}
```
Furthermore, the window resize event listener can be debounced or bound to `window.visualViewport.addEventListener('resize', ...)` to handle soft-keyboard inputs or screen rotations cleanly.

---

## 5. Summary of Recommended Approach
By combining `100svh` for layout sizing, `viewport-fit=cover` with `env(safe-area-inset-*)` for notched display padding, and `visualViewport` in JavaScript, we establish a robust, modern, and human-centric mobile layout system. 

It prevents dynamic address bars from triggering layout shifts, protects key UI elements from being cut off by the notch, and guarantees that buttons are never covered by the iOS swipe-home gesture.
