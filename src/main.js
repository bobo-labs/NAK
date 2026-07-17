import * as THREE from 'three/webgpu';
import {
  pass,
  mrt,
  output,
  depth,
  uniform,
  toonOutlinePass,
  mix,
  step,
  smoothstep,
  screenUV,
} from 'three/tsl';
import { customDof } from './CustomDepthOfFieldNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================================
// TWEAKABLE CONFIGURATION & QUALITY TIERS
// ============================================================================
export const CONFIG = {

  // --- Renderer Exposure ---
  toneMappingExposure: 1.0,

  // --- Custom Three.js Lights (added ON TOP of GLB lights) ---
  ambientLightIntensity: 0.3,
  ambientLightColor: 0xffffff,

  dirLightIntensity: 0.0,
  dirLightColor: 0xffffff,
  dirLightPosition: { x: 5, y: 10, z: 7 },

  // --- GLB embedded lights ---
  glbLightsIntensityMultiplier: 0.0022,

  // --- Depth of Field (DepthOfFieldNode – WebGPU/TSL) ---
  enableDoF: true,

  // Focus distance: world-units along camera look direction (auto-computed each frame from conch mesh)
  dofFocus: 5.0,

  // Focal length: world-units of the in-focus zone around the focal plane
  dofFocalLength: 1.5,

  // Bokeh scale: unitless blur disc multiplier (0 = off, 1-5 = subtle to strong)
  dofBokehScale: 6.0,

  // --- Toon Outline Settings (WebGPU/TSL) ---
  enableOutline: true,
  outlineColor: 0x0a101d, // dark navy outline color
  outlineThickness: 0.0040, // outline line thickness
  outlineAlpha: 1.0,

  // --- Dynamic settings (loaded based on hardware capacity) ---
  dofSamples1st: 16,
  dofSamples2nd: 4,
  enableSMAA: true,

  // --- HUD bottom-edge fade ---
  // screenUV.y convention: 0 = top of screen, 1 = bottom.
  // tabla_hud (wooden beam) sits at the top.  The beam's bottom edge lands
  // at roughly Y = 0.065-0.075 of screen height.  Adjust these two values
  // to shift or widen the fade zone.
  hudEdgeFadeStart: 0.072,  // Y where the soft fade begins (inside the beam)
  hudEdgeFadeEnd: 0.082,  // Y where the fade reaches full transparency
};

const QUALITY_PROFILES = {
  HIGH: {
    label: 'High Quality',
    pixelRatioMax: 1.4,
    shadowMapSize: 1024,
    shadowType: THREE.PCFSoftShadowMap,
    enableDoF: true,
    enableOutline: true,
    dofSamples1st: 16,
    dofSamples2nd: 1,
    enableSMAA: false,
  },
  MEDIUM: {
    label: 'Medium Quality',
    pixelRatioMax: 1.0,
    shadowMapSize: 512,
    shadowType: THREE.PCFShadowMap,
    enableDoF: true,
    enableOutline: true,
    dofSamples1st: 8,
    dofSamples2nd: 1,
    enableSMAA: false,
  },
  LOW: {
    label: 'Low Quality (CPU Mode)',
    pixelRatioMax: 0.7,
    shadowMapSize: 256,         // minimal BasicShadowMap so Lambert can receive shadows
    shadowType: THREE.BasicShadowMap,
    enableDoF: false,
    enableOutline: false,
    dofSamples1st: 1,
    dofSamples2nd: 1,
    enableSMAA: false,
  }
};
// ============================================================================


// ---- DOM ----
const canvasContainer = document.querySelector('#canvas-container');
const canvas = document.querySelector('#webgl-canvas');
const hudIconBtn = document.querySelector('#hud-icon-btn');
const hudIconImg = document.querySelector('#hud-icon-img');
const hudBrandContainer = document.querySelector('#hud-brand-container');
const preloader = document.querySelector('#preloader');
const preloaderStatus = document.querySelector('#preloader-status');
const preloaderProgress = document.querySelector('#preloader-progress');
const fallbackScreen = document.querySelector('#unsupported-fallback');

// Top banner HUD & Wallet Selectors
const topHudBar = document.querySelector('#top-hud-bar');
const walletConnectWrapper = document.querySelector('.wallet-connect-wrapper');
const walletConnectBtn = document.querySelector('#wallet-connect-btn');
const walletDropdown = document.querySelector('#wallet-dropdown');
const walletOptionBtns = document.querySelectorAll('.wallet-option-btn');

// Yellow card UI
const askConchOverlay = document.querySelector('#ask-conch-overlay');
const cardStateAsk = document.querySelector('#card-state-ask');
const cardStatePull = document.querySelector('#card-state-pull');
const questionRandomSpan = document.querySelector('#question-random');
const questionRadioBtns = document.querySelectorAll('input[name="conch-question"]');
const burnBtn = document.querySelector('#burn-btn');
const conchPullBtn = document.querySelector('#conch-pull-btn');

// Wallet signature modal
const walletSignatureModal = document.querySelector('#wallet-signature-modal');
const signatureMessageText = document.querySelector('#signature-message-text');
const sigRejectBtn = document.querySelector('#sig-reject-btn');
const sigApproveBtn = document.querySelector('#sig-approve-btn');
const sigLoader = document.querySelector('#sig-loader');

// ---- Core objects ----
let scene, renderer, defaultCamera, activeCamera;
let postProcessing, scenePassNode;
let dofUniformFocus, dofUniformFocalLength, dofUniformBokehScale;
let outlineColorNode, outlineThicknessNode, outlineAlphaNode;
let controls;
const tablaHudMeshes = [];
let tablaHudMesh = null;

// ---- Animation ----
let mixer, clock;
let cameraAction = null;
const pullActions = [];
let isPulling = false;
let pullSoundTimeoutId = null;
let voiceSoundTimeoutId = null;
let resetCardTimeoutId = null;

// ---- Sound Effects ----
const pullSound = new Audio('/pull_string.mp3');

const conchVoiceFiles = [
  { path: '/audios/No..mp3', weight: 5 },
  { path: '/audios/Nothing..mp3', weight: 5 },
  { path: '/audios/Ask next time..mp3', weight: 1 },
  { path: '/audios/Follow the seahorse..mp3', weight: 1 },
  { path: '/audios/I dont think so..mp3', weight: 1 },
  { path: '/audios/I see a new sauce in your future..mp3', weight: 1 },
  { path: '/audios/Maybe someday..mp3', weight: 1 },
  { path: '/audios/Neither..mp3', weight: 1 },
  { path: '/audios/Try asking again..mp3', weight: 1 },
  { path: '/audios/Yes..mp3', weight: 1 },
  { path: '/audios/You cannot get to the top by sitting on your bottom..mp3', weight: 1 }
];

const conchVoices = conchVoiceFiles.map(file => ({
  audio: new Audio(file.path),
  weight: file.weight
}));

function getWeightedRandomConchVoice() {
  const totalWeight = conchVoices.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of conchVoices) {
    if (random < item.weight) {
      return item.audio;
    }
    random -= item.weight;
  }
  return conchVoices[0].audio;
}

// ---- Icon Hover Animation ----
const totalFrames = 90;
const iconFrames = []; // Holds preloaded Image objects
let hoverAnimationId = null;
let currentFrame = 1;
let isHovering = false;

// Preload icon frames immediately on script load
for (let i = 1; i <= totalFrames; i++) {
  const img = new Image();
  const frameStr = String(i).padStart(4, '0');
  img.src = `/icon%2050x50/${frameStr}.webp`;
  iconFrames.push(img);
}

// ---- HUD plane (button anchor) ----
let hudPlane = null;
let currentModelPath = null;
let loadedModelGroup = null;

// ---- Floating Token Bubbles Data ----
let tokenBubblesData = [];
let isBenchmarkFinished = false;

// ---- Special Promo Bubble Configuration ----
const bubble_promo = {
  enabled: true,
  canisterId: 'eig2s-waaaa-aaaam-qbg5a-cai',
  symbol: 'NAK',
  logo: null,       // Loaded dynamically from API on success, or falls back
  change: null,     // Loaded dynamically from API on success, or falls back
  url: 'https://icptokens.net/token/eig2s-waaaa-aaaam-qbg5a-cai',
  isPromo: true
};

// ---- Target objects for calculations ----
let conchMesh = null;

// ---- Reusable scratch vectors – avoids new THREE.Vector3() allocation every frame ----
// Issue fix: per-frame Vector3 allocations create GC pressure at 60 FPS
const _conchWorldPos = new THREE.Vector3();
const _cameraWorldPos = new THREE.Vector3();
const _cameraForward = new THREE.Vector3();
const _toConch = new THREE.Vector3();
const _hudWorldPos = new THREE.Vector3();
const _hudTopLeftWorldPos = new THREE.Vector3();

// ---- DoF node reference – tracked so it can be disposed before rebuilding ----
let currentDofNode = null;

// ---- HUD camera – a layer-1-only clone of the active camera, used to generate
// the HUD mask that lets us composite the pre-DoF sharp HUD on top of the blur ----
let hudCamera = null;

// ---- LOW-quality CPU material cache – stores originals so they can be restored ----
// When LOW mode is active we swap every scene material to MeshBasicNodeMaterial (unlit).
// This eliminates all lighting, shadow-receive, and toon-ramp shader work — the biggest
// source of fragment-shader cost for a software CPU rasterizer.
const _originalMaterials = new Map(); // mesh → original material(s)

// ---- Benchmarking & Calibration ----
let isBenchmarking = false;
let warmupFrameCount = -1;
const WARMUP_FRAMES_LIMIT = 45; // ~1.5s at 30fps to let shaders compile and GPU driver cache warm up
let benchmarkFrameCount = 0;
const benchmarkFrameTimes = [];
let lastFrameTime = 0;
let lastRenderTime = 0;
let _resizeTimer = null;  // debounce handle for window resize events
let currentProfileName = 'HIGH';
let isMobile = false;

function setProgress(percent, status) {
  if (preloaderProgress) {
    preloaderProgress.style.width = `${percent}%`;
  }
  if (preloaderStatus) {
    preloaderStatus.textContent = status;
  }
}

// =============================================================================
// MATERIAL UTILITIES FOR CPU / LOW-QUALITY MODE
// =============================================================================

// Build a MeshLambertNodeMaterial for the LOW / CPU quality tier.
// Lambert gives ambient light response + diffuse shading + shadow receiving
// at a small fraction of the cost of MeshToonNodeMaterial:
//   – No specular calculations
//   – No toon-ramp gradient lookup
//   – No normal-map contribution to the lighting model
// This replaces the purely unlit MeshBasicNodeMaterial which had no
// ambient or shadow contribution at all.
function convertToLowQualityMaterial(originalMat) {
  if (!originalMat) return null;
  const mat = new THREE.MeshLambertNodeMaterial();
  if (originalMat.color) mat.color.copy(originalMat.color);
  mat.map = originalMat.map ?? null;
  // Pass the emissive map through so baked AO / emissive details are preserved
  if (originalMat.emissiveMap !== undefined) mat.emissiveMap = originalMat.emissiveMap;
  if (originalMat.emissive) mat.emissive.copy(originalMat.emissive);
  mat.transparent = originalMat.transparent;
  mat.opacity = originalMat.opacity;
  mat.alphaTest = originalMat.alphaTest;
  mat.depthWrite = originalMat.depthWrite;
  mat.depthTest = originalMat.depthTest;
  mat.side = originalMat.side;
  mat.dithering = true;
  return mat;
}

// Replace every scene material with a MeshLambertNodeMaterial (ambient + diffuse + shadows).
// Original materials are stored in _originalMaterials so they can be restored on quality change.
function simplifyMaterialsForCPU() {
  if (!scene || _originalMaterials.size > 0) return; // avoid double-conversion
  scene.traverse((child) => {
    if (child.isMesh && child.material) {
      _originalMaterials.set(child, child.material);
      if (Array.isArray(child.material)) {
        child.material = child.material.map(m => convertToLowQualityMaterial(m));
      } else {
        child.material = convertToLowQualityMaterial(child.material);
      }
    }
  });
  console.log(`[Low Quality] Swapped ${_originalMaterials.size} meshes → MeshLambertNodeMaterial (ambient + shadows, no toon shader).`);
}

// Restore the original materials (ToonMaterial / standard) when leaving LOW quality.
function restoreOriginalMaterials() {
  if (_originalMaterials.size === 0) return;
  _originalMaterials.forEach((mat, mesh) => {
    mesh.material = mat;
  });
  _originalMaterials.clear();
  console.log('[Low Quality] Restored original materials.');
}

function applyQualityProfile(profileName) {
  currentProfileName = profileName;
  const p = QUALITY_PROFILES[profileName];
  console.log(`[Quality Profile] Setting profile parameters for: ${p.label}`);

  CONFIG.dofSamples1st = p.dofSamples1st;
  CONFIG.dofSamples2nd = p.dofSamples2nd;
  CONFIG.enableSMAA = p.enableSMAA;
  CONFIG.enableDoF = p.enableDoF;
  CONFIG.enableOutline = p.enableOutline;

  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, p.pixelRatioMax));
    const size = getContainerSize();
    const res = getRenderResolution(size.w, size.h);
    renderer.setSize(res.w, res.h, false);

    const canvas = renderer.domElement;
    if (canvas) {
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }

    renderer.shadowMap.enabled = p.shadowMapSize > 0;
    renderer.shadowMap.type = p.shadowType;
  }

  // Traverse scene lights and adjust shadow maps dynamically
  scene.traverse((child) => {
    if (child.isLight && child.castShadow) {
      if (p.shadowMapSize === 0) {
        child.castShadow = false;
      } else {
        child.castShadow = true;
        child.shadow.mapSize.width = p.shadowMapSize;
        child.shadow.mapSize.height = p.shadowMapSize;
        if (child.shadow.map) {
          child.shadow.map.dispose();
          child.shadow.map = null;
        }
      }
    }
  });

  // ── Material simplification for CPU / LOW mode ──────────────────────────────
  // conchMesh being non-null is the reliable signal that the GLB scene is loaded
  // and mesh materials have already been set up (toon conversion etc.).
  // We skip this during the first applyQualityProfile calls that run before the GLB loads.
  if (conchMesh) {
    if (profileName === 'LOW') {
      simplifyMaterialsForCPU();
    } else {
      restoreOriginalMaterials();
    }
  }

  // Rebuild post-processing
  if (activeCamera) {
    buildPostProcessing(activeCamera);
  }
}

function convertToToonMaterial(originalMat) {
  if (!originalMat) return null;

  // We construct a new MeshToonNodeMaterial
  const toonMat = new THREE.MeshToonNodeMaterial();

  // Copy standard styling parameters
  if (originalMat.color) toonMat.color.copy(originalMat.color);
  if (originalMat.map !== undefined) toonMat.map = originalMat.map;
  if (originalMat.normalMap !== undefined) toonMat.normalMap = originalMat.normalMap;
  if (originalMat.normalScale !== undefined) toonMat.normalScale.copy(originalMat.normalScale);
  if (originalMat.gradientMap !== undefined) toonMat.gradientMap = originalMat.gradientMap;

  // Copy transparency settings
  toonMat.transparent = originalMat.transparent;
  toonMat.opacity = originalMat.opacity;
  toonMat.alphaTest = originalMat.alphaTest;
  toonMat.depthWrite = originalMat.depthWrite;
  toonMat.depthTest = originalMat.depthTest;
  toonMat.side = originalMat.side;
  toonMat.dithering = true; // prevent color banding on these materials

  return toonMat;
}

// ---- Background meshes (need cover-scale on resize) ----
const bgMeshes = []; // { mesh, origScaleX, origScaleY, origScaleZ }
let designAspect = null; // dynamic: computed from actual container each frame
let designFov = null;    // current VFOV in degrees (recomputed each resize from HFOV)

// Exact horizontal FOV as shown in Blender's lens properties.
// This is the authoritative source of truth for the camera framing.
const DESIGN_HFOV_DEG = 25.4;


// =============================================================================
// 1. INIT  (async – required for WebGPU)
// =============================================================================
async function init() {
  clock = new THREE.Clock();
  scene = new THREE.Scene();

  setProgress(10, 'Initializing Portal...');

  // --- Fallback camera (OrbitControls, used until GLB camera is found) ---
  defaultCamera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    500
  );
  defaultCamera.position.set(0, 2, 8);
  activeCamera = defaultCamera;

  // --- Detect initial device capability profile ---
  isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const hasWebGPU = !!navigator.gpu;

  // --- Check for software rendering (disabled hardware acceleration) ---
  let isSoftwareRenderer = false;
  try {
    const tempCanvas = document.createElement('canvas');
    const gl = tempCanvas.getContext('webgl') || tempCanvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const unmaskedRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
        console.log('[Graphics] GPU WebGL Renderer Name:', unmaskedRenderer);
        if (/SwiftShader|Software|llvmpipe|Basic Render|VirtualBox|Generic/i.test(unmaskedRenderer)) {
          isSoftwareRenderer = true;
        }
      }
    }
  } catch (e) {
    console.warn('[Graphics] Failed to query WebGL debug info:', e);
  }

  // Also check WebGPU adapter if WebGPU is available
  if (hasWebGPU) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        const info = adapter.info || (typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : null);
        if (info) {
          const desc = info.description || info.device || '';
          console.log('[Graphics] WebGPU Adapter Description:', desc);
          if (/SwiftShader|Software|llvmpipe|Basic Render/i.test(desc)) {
            isSoftwareRenderer = true;
          }
        }
      }
    } catch (e) {
      console.warn('[Graphics] Failed to query WebGPU adapter info:', e);
    }
  }

  let initialGuess = 'HIGH';
  if (isMobile || !hasWebGPU) {
    initialGuess = 'MEDIUM'; // mobile and WebGL fallback start in medium quality
  }
  if (isSoftwareRenderer) {
    console.warn('[Graphics] Software rendering detected (No GPU Hardware Acceleration)! Defaulting to Low Quality.');
    initialGuess = 'LOW';
  }
  currentProfileName = initialGuess;

  // High quality gets 4x MSAA, Medium/Low get 2x MSAA for efficiency
  const initialSamples = initialGuess === 'HIGH' ? 4 : 2;

  // --- WebGPU/WebGL Fallback Renderer ---
  try {
    const rendererParams = {
      canvas,
      antialias: true,
      samples: initialSamples
    };

    // Force the WebGL2 backend if we are running in software mode for much better CPU performance
    if (isSoftwareRenderer) {
      console.log('[Graphics] Forcing WebGL2 backend for CPU rendering optimization.');
      rendererParams.forceWebGL = true;
    }

    renderer = new THREE.WebGPURenderer(rendererParams);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = CONFIG.toneMappingExposure;

    // Explicit WebGPU/WebGL initialisation
    await renderer.init();
  } catch (err) {
    console.error('[Graphics] WebGPURenderer failed to initialize:', err);
    if (preloader) preloader.style.display = 'none';
    if (fallbackScreen) fallbackScreen.classList.remove('hidden');
    return;
  }

  // Set default settings according to initial profile guess
  applyQualityProfile(initialGuess);

  // --- Lights ---
  const ambientLight = new THREE.AmbientLight(
    CONFIG.ambientLightColor,
    CONFIG.ambientLightIntensity
  );
  ambientLight.name = 'CustomAmbient';
  ambientLight.layers.enable(1); // visible to hudCamera (layer-1 HUD compositing pass)
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(
    CONFIG.dirLightColor,
    CONFIG.dirLightIntensity
  );
  dirLight.name = 'CustomDir';
  dirLight.position.set(
    CONFIG.dirLightPosition.x,
    CONFIG.dirLightPosition.y,
    CONFIG.dirLightPosition.z
  );
  // dirLightIntensity = 0 → this light contributes nothing visually.
  // Shadow casting on a zero-intensity light wastes an entire extra draw call per frame.
  dirLight.castShadow = false;
  dirLight.layers.enable(1); // visible to hudCamera (layer-1 HUD compositing pass)
  scene.add(dirLight);

  // --- OrbitControls (fallback until GLB camera is activated) ---
  controls = new OrbitControls(defaultCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // --- Build initial post-processing with default camera ---
  buildPostProcessing(activeCamera);

  // --- Load GLB ---
  loadModel();

  // --- Fetch Token Data for Floating Bubbles ---
  fetchTokenData();

  // --- Events ---
  // Debounced resize: dragging the window edge fires dozens of events per second.
  // Each resize call reallocates the WebGL framebuffer — expensive GPU op.
  // Wait 100ms of idle before executing the actual resize.
  const handleResize = () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(onWindowResize, 100);
  };
  window.addEventListener('resize', handleResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize);
  }

  // Randomize Question #2 on load
  const randomTokens = ['$EXE', '$WUMBO', '$MCDOMS'];
  const chosenToken = randomTokens[Math.floor(Math.random() * randomTokens.length)];
  if (questionRandomSpan) {
    questionRandomSpan.textContent = `Should I buy ${chosenToken}?`;
  }

  // Toggle wallet Connect dropdown
  if (walletConnectBtn && walletDropdown) {
    walletConnectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      walletDropdown.classList.toggle('hidden');
    });
  }

  document.addEventListener('click', () => {
    if (walletDropdown) walletDropdown.classList.add('hidden');
  });

  // Connect mock wallet options
  walletOptionBtns.forEach(optionBtn => {
    optionBtn.addEventListener('click', () => {
      const walletType = optionBtn.getAttribute('data-wallet');
      connectMockWallet(walletType);
    });
  });

  // Enable/disable BURN button based on question selection
  questionRadioBtns.forEach(radio => {
    radio.addEventListener('change', () => {
      if (burnBtn) burnBtn.disabled = false;
    });
  });

  // BURN button event to show signature request modal
  if (burnBtn) {
    burnBtn.addEventListener('click', () => {
      let selectedQuestionText = "";
      questionRadioBtns.forEach(radio => {
        if (radio.checked) {
          const parentLabel = radio.closest('.question-option');
          if (parentLabel) {
            const textSpan = parentLabel.querySelector('.question-text');
            if (textSpan) selectedQuestionText = textSpan.textContent;
          }
        }
      });
      if (!selectedQuestionText) return;

      if (signatureMessageText) {
        signatureMessageText.textContent = `ask_oracle("${selectedQuestionText}")`;
      }

      // Customize signature request header matching selected wallet
      const walletHeaderTitle = walletSignatureModal.querySelector('.wallet-modal-title');
      const walletAvatar = walletSignatureModal.querySelector('.wallet-avatar');
      if (walletHeaderTitle && walletAvatar) {
        if (connectedWalletType === 'ii') {
          walletHeaderTitle.textContent = "Internet Identity";
          walletAvatar.textContent = "♾️";
        } else if (connectedWalletType === 'bitfinity') {
          walletHeaderTitle.textContent = "Bitfinity Wallet";
          walletAvatar.textContent = "🔮";
        } else {
          walletHeaderTitle.textContent = "Plug Wallet";
          walletAvatar.textContent = "🔌";
        }
      }

      if (walletSignatureModal) {
        walletSignatureModal.classList.remove('hidden');
      }
    });
  }

  // Signature modal reject/approve actions
  if (sigRejectBtn) {
    sigRejectBtn.addEventListener('click', () => {
      if (walletSignatureModal) walletSignatureModal.classList.add('hidden');
    });
  }

  if (sigApproveBtn) {
    sigApproveBtn.addEventListener('click', () => {
      if (sigLoader) sigLoader.classList.remove('hidden');
      setTimeout(() => {
        if (sigLoader) sigLoader.classList.add('hidden');
        if (walletSignatureModal) walletSignatureModal.classList.add('hidden');
        if (cardStateAsk) cardStateAsk.classList.add('hidden');
        if (cardStatePull) cardStatePull.classList.remove('hidden');
      }, 1500);
    });
  }

  // Conch pull button integration
  if (conchPullBtn) {
    conchPullBtn.addEventListener('click', onPullCord);
  }

  if (hudIconBtn) {
    hudIconBtn.addEventListener('mouseenter', startIconAnimation);
    hudIconBtn.addEventListener('mouseleave', stopIconAnimation);
    hudIconBtn.addEventListener('click', () => {
      console.log('[HUD Icon] Clicked!');
    });
  }

  // --- Render loop ---
  renderer.setAnimationLoop(animate);
}


// =============================================================================
// 2. POST-PROCESSING PIPELINE  (rebuilds whenever active camera changes)
// =============================================================================
function buildPostProcessing(camera) {
  // ── Dispose previous DoF node before replacing it ────────────────────────────
  if (currentDofNode) {
    currentDofNode.dispose();
    currentDofNode = null;
  }

  // ── Create/refresh the HUD camera (same viewpoint, layer 1 only) ─────────────
  // tabla_hud is in layer 1 ONLY (see loadModel traverse: child.layers.set(1)).
  // The hudCamera sees only layer 1 objects, giving us an isolated render of
  // tabla_hud (with layer-1 lights) that has never been touched by DoF.
  hudCamera = camera.clone();
  hudCamera.near = camera.near;
  hudCamera.far = camera.far;
  hudCamera.layers.set(1);                          // only layer 1
  // Disable automatic matrix recomputation from position/quaternion/scale.
  // Three.js would otherwise overwrite our manual matrixWorld sync (done in
  // animate() each frame) with the stale transform from clone-time, causing
  // tabla_hud to drift in screen space as the camera animates.
  hudCamera.matrixAutoUpdate = false;
  hudCamera.matrixWorld.copy(camera.matrixWorld);
  if (camera.matrixWorldInverse) {
    hudCamera.matrixWorldInverse.copy(camera.matrixWorldInverse);
  }
  hudCamera.projectionMatrix.copy(camera.projectionMatrix);
  hudCamera.updateProjectionMatrix();

  // Uniform nodes allow live-tweaking CONFIG values each frame
  dofUniformFocus = uniform(CONFIG.dofFocus);
  dofUniformFocalLength = uniform(CONFIG.dofFocalLength);

  // Scale the initial bokeh blur radius based on the current render target height to compensate for high DPI/vertical resolutions
  const _size = getContainerSize();
  const _res = getRenderResolution(_size.w, _size.h);
  dofUniformBokehScale = uniform(CONFIG.dofBokehScale * (_res.h / 953));

  // ── Main scene pass (all layers, including tabla_hud) with toon outlines ─────
  if (CONFIG.enableOutline) {
    outlineColorNode = uniform(new THREE.Color(CONFIG.outlineColor));
    outlineThicknessNode = uniform(CONFIG.outlineThickness);
    outlineAlphaNode = uniform(CONFIG.outlineAlpha);

    scenePassNode = toonOutlinePass(scene, camera, outlineColorNode, outlineThicknessNode, outlineAlphaNode);
  } else {
    scenePassNode = pass(scene, camera);
  }
  scenePassNode.setMRT(mrt({ output, depth }));

  // scenePassColor = sharp scene WITH toon outlines (pre-DoF)
  const scenePassColor = scenePassNode.getTextureNode('output');
  const viewZNode = scenePassNode.getViewZNode();

  // ── HUD compositing pass (ONLY tabla_hud, layer-1 camera) ──────────────────────
  // tabla_hud is on layer 1 ONLY (removed from layer 0 in loadModel).
  // The main scene pass (layer 0) never renders it, so DoF can never blur it
  // and no bokeh from it bleeds into postDofNode.
  // Lights are on layer 1 (enabled in loadModel) so hudPassColor is correctly lit.
  let hudPassNode;
  if (CONFIG.enableOutline) {
    hudPassNode = toonOutlinePass(scene, hudCamera, outlineColorNode, outlineThicknessNode, outlineAlphaNode);
  } else {
    hudPassNode = pass(scene, hudCamera);
  }
  const hudPassTexture = hudPassNode.getTextureNode('output');

  // ── Soft bottom-edge fade ─────────────────────────────────────────────────
  // screenUV.y: 0 = top of screen, 1 = bottom (WebGPU convention).
  // smoothstep(a, b, y) → 0 at y=a, 1 at y=b.
  // .oneMinus() flips it: 1 above the fade zone, 0 below it.
  // Multiplied by the binary alpha mask → only tabla_hud pixels are faded;
  // every other pixel stays at 0 (DoF shows through unchanged).
  const edgeFade = smoothstep(
    CONFIG.hudEdgeFadeStart,
    CONFIG.hudEdgeFadeEnd,
    screenUV.y
  ).oneMinus();
  const hudMask = step(0.5, hudPassTexture.a).mul(edgeFade);
  const hudPassColor = hudPassTexture;  // correctly lit, DoF-free tabla_hud

  postProcessing = new THREE.RenderPipeline(renderer);

  if (CONFIG.enableDoF) {
    currentDofNode = customDof(
      scenePassColor,
      viewZNode,
      dofUniformFocus,
      dofUniformFocalLength,
      dofUniformBokehScale,
      CONFIG.dofSamples1st,
      CONFIG.dofSamples2nd
    );

    // DoF blurs the main scene (which does NOT contain tabla_hud).
    // Then we stamp the correctly lit, sharp tabla_hud on top.
    // No ghost/duplicate because tabla_hud is absent from postDofNode entirely.
    // mix(a, b, t): t=0 → a (DoF-blurred scene without tabla_hud)
    //               t=1 → b (sharp, correctly lit tabla_hud from HUD pass)
    const postDofNode = CONFIG.enableSMAA ? smaa(currentDofNode) : currentDofNode;
    postProcessing.outputNode = mix(postDofNode, hudPassColor, hudMask);
  } else {
    // No DoF — composite the HUD (layer 1) on top of the main scene (layer 0)
    const baseColorNode = CONFIG.enableSMAA ? smaa(scenePassColor) : scenePassColor;
    postProcessing.outputNode = mix(baseColorNode, hudPassColor, hudMask);
  }
}


// =============================================================================
// 3. LOAD MODEL
// =============================================================================
function loadModel(modelPath) {
  const isVertical = window.innerHeight > window.innerWidth;
  // Determine target model dynamically if not explicitly specified
  if (!modelPath) {
    modelPath = isVertical ? '/Scene_Vertical.glb' : '/Scene_Desktop.glb';
  }

  // Smooth preloader transition during orientation switches
  if (preloader) {
    preloader.style.display = 'flex';
    preloader.classList.remove('fade-out');
    setProgress(10, 'Loading Portal...');
  }

  // Clear previous model from the scene to prevent overlapping/memory leaks
  if (loadedModelGroup) {
    scene.remove(loadedModelGroup);
    loadedModelGroup.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
    loadedModelGroup = null;
  }

  // Stop active animations/timeouts
  if (pullSoundTimeoutId) { clearTimeout(pullSoundTimeoutId); pullSoundTimeoutId = null; }
  if (voiceSoundTimeoutId) { clearTimeout(voiceSoundTimeoutId); voiceSoundTimeoutId = null; }
  if (resetCardTimeoutId) { clearTimeout(resetCardTimeoutId); resetCardTimeoutId = null; }
  isPulling = false;
  conchVoices.forEach(item => {
    item.audio.pause();
    item.audio.currentTime = 0;
  });

  // Clear tracking references
  bgMeshes.length = 0;
  tablaHudMeshes.length = 0;
  pullActions.length = 0;
  cameraAction = null;
  hudPlane = null;
  tablaHudMesh = null;
  conchMesh = null;

  currentModelPath = modelPath;

  const loader = new GLTFLoader();
  setProgress(25, 'Downloading Portal assets...');

  loader.load(
    modelPath,
    (gltf) => {
      const model = gltf.scene;
      loadedModelGroup = model;
      scene.add(model);

      console.log('[GLB] Loaded. Animations:', gltf.animations.map(c => c.name));

      // --- Animation Mixer (attached to root so ALL object animations work) ---
      mixer = new THREE.AnimationMixer(model);

      // --- Camera: prefer gltf.cameras[] (most reliable) ---
      let glbCamera = null;
      if (gltf.cameras && gltf.cameras.length > 0) {
        glbCamera = gltf.cameras[0];
        console.log('[Camera] Found in gltf.cameras[]:', glbCamera.name, '| fov:', glbCamera.fov?.toFixed(1) + '°');
      }

      // --- Traverse: lights, HUD plane, conch, background, shadows (+ fallback camera) ---
      model.traverse((child) => {
        // GLB lights
        if (child.isLight) {
          console.log(`[GLB Light] "${child.name}" intensity=${child.intensity.toFixed(3)}`);
          if (child.userData._origIntensity === undefined) {
            child.userData._origIntensity = child.intensity;
          }
          child.intensity = child.userData._origIntensity * CONFIG.glbLightsIntensityMultiplier;
          // Enable layer 1 so the hudCamera (layer-1-only) can use these lights
          // to correctly illuminate tabla_hud in the isolated HUD compositing pass.
          child.layers.enable(1);
        }

        // Fallback camera detection
        if (!glbCamera && child.isCamera) {
          glbCamera = child;
          console.log('[Camera] Found via traverse:', child.name);
        }

        // HUD plane (the yellow square – used to anchor the button)
        if (child.isMesh && child.name.toLowerCase().includes('plane')) {
          console.log('[HUD] Plane found:', child.name);
          hudPlane = child;
          if (child.material) {
            child.material = child.material.clone();
            child.material.transparent = true;
            child.material.opacity = 0.0;
            child.material.depthWrite = false;
          }
        }

        // New HUD anchor object (tabla_hud) - parented to camera, inherits camera animation
        if (child.isMesh && child.name.toLowerCase().startsWith('tabla_hud')) {
          console.log('[HUD] Tabla HUD component found:', child.name);
          if (child.name.toLowerCase() === 'tabla_hud') {
            tablaHudMesh = child;
          }
          // Store the mesh and its original Blender scale so we can scale-compensate
          // on narrow viewports when the HTML scale floor (0.35) is active.
          tablaHudMeshes.push({
            mesh: child,
            origScaleX: child.scale.x,
            origScaleY: child.scale.y,
            origScaleZ: child.scale.z
          });
          // !! Layer 1 ONLY — do NOT keep in layer 0 !!
          child.layers.set(1);
          // Hide the 3D HUD banner completely in all orientations, since we now use
          // the 2D HTML/CSS background texture (/tablawebp.webp) for both desktop and mobile.
          child.visible = false;
        }

        // Conch shell mesh detection (target for distance calculation)
        // Use includes() to be robust to Blender naming variations (e.g. "Conch", "conch.001")
        if (child.isMesh && child.name.toLowerCase().includes('conch')) {
          console.log('[GLB] Conch mesh found:', child.name);
          conchMesh = child;
        }

        // Background meshes – store original scale so we can cover-scale on resize
        if (child.isMesh && child.name.toLowerCase().startsWith('bg')) {
          console.log('[GLB] Background mesh found:', child.name);
          bgMeshes.push({
            mesh: child,
            origScaleX: child.scale.x,
            origScaleY: child.scale.y,
            origScaleZ: child.scale.z,
          });
        }

        // Shadows, Toonify (Targeted Outlines) & Dithering
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          const nameLower = child.name.toLowerCase();
          // Target outlines on: conch, cord/ring, arms, body, hands, and cylinder components
          const isOutlineTarget = (
            nameLower.includes('conch') ||
            nameLower.includes('cord') ||
            nameLower.includes('cylinder') ||
            nameLower.includes('arm') ||
            nameLower.includes('body') ||
            nameLower.includes('hand') ||
            nameLower.includes('tabla')
          );

          if (isOutlineTarget && !nameLower.includes('tabla')) {
            // Enable layer 1 so it also renders in the isolated HUD compositing pass.
            // This ensures it is depth-tested correctly and renders OVER the tabla_hud.
            child.layers.enable(1);
          }

          if (child.material) {
            if (isOutlineTarget) {
              console.log(`[GLB Toonify] Converting material to toon for outlines: ${child.name}`);
              if (Array.isArray(child.material)) {
                child.material = child.material.map(mat => convertToToonMaterial(mat));
              } else {
                child.material = convertToToonMaterial(child.material);
              }
            } else {
              // Apply simple dithering to background and non-outlined meshes
              if (Array.isArray(child.material)) {
                child.material.forEach((mat) => {
                  mat.dithering = true;
                });
              } else {
                child.material.dithering = true;
              }
            }
          }
        }
      });

      // --- Activate GLB camera ---
      if (glbCamera) {
        activeCamera = glbCamera;

        const size = getContainerSize();
        const _initAspect = (size.h > 0) ? (size.w / size.h) : (1920 / 953);

        const isPortraitModel = currentModelPath && currentModelPath.includes('Vertical');
        if (isPortraitModel) {
          designFov = 25.36; // Constant Vert+ for portrait camera
        } else {
          // Use the Blender-reported horizontal FOV (25.4°) as the source of truth.
          const _hHalfRad = THREE.MathUtils.degToRad(DESIGN_HFOV_DEG / 2);
          designFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(_hHalfRad) / _initAspect));
        }
        designAspect = null;

        activeCamera.aspect = _initAspect;
        activeCamera.fov = designFov;
        activeCamera.updateProjectionMatrix();
        activeCamera.updateWorldMatrix(true, false);
        controls.enabled = false;

        console.log(`[Camera] Path: ${currentModelPath} | init aspect: ${_initAspect.toFixed(3)} | VFOV: ${designFov.toFixed(2)}°`);
        console.log('[Camera] Active:', glbCamera.name, '| near:', glbCamera.near, '| far:', glbCamera.far);
      } else {
        console.warn('[Camera] No GLB camera found – using default OrbitControls camera.');
      }

      // --- Sort & register animations ---
      gltf.animations.forEach((clip) => {
        const isCameraClip = clip.tracks.some(t =>
          t.name.toLowerCase().includes('camera')
        );

        if (isCameraClip) {
          console.log('[Anim] Camera loop → auto-play:', clip.name);
          cameraAction = mixer.clipAction(clip);
          cameraAction.setLoop(THREE.LoopRepeat);
          cameraAction.clampWhenFinished = false;
          cameraAction.play();
        } else {
          console.log('[Anim] Pull animation registered:', clip.name);
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopOnce);
          action.clampWhenFinished = true;
          action.stop();
          pullActions.push(action);
        }
      });

      // Callback when a pull animation finishes
      mixer.addEventListener('finished', (e) => {
        if (pullActions.includes(e.action)) {
          if (!pullActions.some(a => a.isRunning())) onPullFinished();
        }
      });

      // Re-init post-processing with the GLB camera
      applyQualityProfile(currentProfileName);

      setProgress(80, 'Compiling Shaders...');

      // Force pipeline creation & compilation by rendering a single frame hidden
      renderer.render(scene, activeCamera);

      // Start warmup phase to let shaders compile and GPU caches settle
      setProgress(85, 'Warming up graphics...');
      warmupFrameCount = 0;
      isBenchmarking = false;

      // Debug helpers
      window.scene = scene;
      window.mixer = mixer;
      window.gltf = gltf;
      window.pullActions = pullActions;
      window.cameraAction = cameraAction;
      window.activeCamera = activeCamera;
      window.renderer = renderer;

      onWindowResize();
    },
    (xhr) => {
      if (xhr.total > 0) {
        const percent = 25 + Math.round((xhr.loaded / xhr.total) * 50); // 25% to 75%
        setProgress(percent, `Loading Portal assets: ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
      }
    },
    (err) => {
      console.error('[GLB] Load error:', err);
      setProgress(100, 'Failed to load assets');
    }
  );
}


// =============================================================================
// 4. 3D → 2D BUTTON PROJECTION (REMOVED)
// =============================================================================
function updateButtonPosition() {
  //    No 3D projection needed — updateLayoutScale() in onWindowResize keeps it sized correctly.
}


// =============================================================================
// 5. BUTTON INTERACTIONS
// =============================================================================
let isWalletConnected = false;
let connectedWalletType = '';

function connectMockWallet(walletType) {
  isWalletConnected = true;
  connectedWalletType = walletType;
  if (walletConnectBtn) {
    walletConnectBtn.textContent = '[ b3a1...7x9 | 4.20 ICP ]';
    walletConnectBtn.style.background = '#ffd635';
  }
  if (walletDropdown) walletDropdown.classList.add('hidden');
}

function resetCardToAskState() {
  questionRadioBtns.forEach(radio => radio.checked = false);
  if (burnBtn) burnBtn.disabled = true;
  if (cardStatePull) cardStatePull.classList.add('hidden');
  if (cardStateAsk) cardStateAsk.classList.remove('hidden');
  if (conchPullBtn) {
    conchPullBtn.disabled = false;
    conchPullBtn.querySelector('.wood-btn-text').textContent = 'PULL THE CORD';
  }
}

function onPullCord() {
  if (isPulling || pullActions.length === 0) return;

  // Clear any pending timeouts from previous pulls
  if (pullSoundTimeoutId) {
    clearTimeout(pullSoundTimeoutId);
    pullSoundTimeoutId = null;
  }
  if (voiceSoundTimeoutId) {
    clearTimeout(voiceSoundTimeoutId);
    voiceSoundTimeoutId = null;
  }
  if (resetCardTimeoutId) {
    clearTimeout(resetCardTimeoutId);
    resetCardTimeoutId = null;
  }

  // Stop all voices to prevent overlaying sounds from quick successive pulls
  conchVoices.forEach(item => {
    item.audio.pause();
    item.audio.currentTime = 0;
  });

  isPulling = true;
  if (conchPullBtn) {
    conchPullBtn.disabled = true;
    conchPullBtn.querySelector('.wood-btn-text').textContent = 'Pulling...';
  }

  pullActions.forEach(action => { action.reset(); action.play(); });

  // Play pull_string.mp3 after 60 frames in 30fps = 2000ms
  pullSoundTimeoutId = setTimeout(() => {
    if (pullSound) {
      pullSound.currentTime = 0;
      pullSound.play().catch(err => console.warn('[Audio] Failed to play pull sound:', err));
    }
    pullSoundTimeoutId = null;
  }, 2000);

  // Play random conch response after 124 frames in 30fps = 4133ms
  voiceSoundTimeoutId = setTimeout(() => {
    const selectedVoice = getWeightedRandomConchVoice();
    if (selectedVoice) {
      selectedVoice.currentTime = 0;
      selectedVoice.play().catch(err => console.warn('[Audio] Failed to play conch voice response:', err));
    }
    voiceSoundTimeoutId = null;
  }, 4133);
}

function onPullFinished() {
  isPulling = false;
  if (conchPullBtn) {
    conchPullBtn.disabled = true;
    conchPullBtn.querySelector('.wood-btn-text').textContent = 'Conch is answering';
  }

  pullActions.forEach(action => action.stop());

  if (resetCardTimeoutId) {
    clearTimeout(resetCardTimeoutId);
  }
  resetCardTimeoutId = setTimeout(() => {
    resetCardToAskState();
    resetCardTimeoutId = null;
  }, 5000);
}


// ---- HUD Icon Hover Animation functions ----
function startIconAnimation() {
  if (isHovering || !hudIconImg) return;
  isHovering = true;

  let lastTime = performance.now();
  const frameInterval = 1000 / 30; // 30 FPS ~33.33ms

  function animateIcon(time) {
    if (!isHovering) return;

    const elapsed = time - lastTime;
    if (elapsed >= frameInterval) {
      currentFrame = (currentFrame % totalFrames) + 1;
      const frameStr = String(currentFrame).padStart(4, '0');
      hudIconImg.src = `/icon%2050x50/${frameStr}.webp`;
      lastTime = time - (elapsed % frameInterval);
    }

    hoverAnimationId = requestAnimationFrame(animateIcon);
  }

  hoverAnimationId = requestAnimationFrame(animateIcon);
}

function stopIconAnimation() {
  isHovering = false;
  if (hoverAnimationId) {
    cancelAnimationFrame(hoverAnimationId);
    hoverAnimationId = null;
  }
  currentFrame = 1;
  if (hudIconImg) {
    hudIconImg.src = `/icon%2050x50/0001.webp`;
  }
}


// =============================================================================
// 6. RESIZE
// =============================================================================
function getContainerSize() {
  // Use the CSS layout viewport (window.innerWidth/Height) — NOT visualViewport.
  // visualViewport.width/height change when the user pinch-zooms, which would
  // cause the renderer and HUD to rescale. window.innerWidth/Height are the
  // stable CSS layout dimensions and are unaffected by pinch-zoom.
  const w = window.innerWidth || 1920;
  const h = window.innerHeight || 953;
  const isVertical = h > w;

  if (isVertical) {
    // Portrait mode: return the full viewport so the 3D scene fills the screen
    // with no black bars. The CSS canvas-container is also max-height/width: 100%
    // in portrait, so this matches. Three.js sets camera.aspect = w/h and
    // renderer.setSize(w, h), adapting the scene to the phone's native ratio.
    return { w: w, h: h };
  } else {
    // Landscape mode: width is 100%, height is capped to (width * 953 / 1920)
    const containerW = w;
    const containerH = Math.round(Math.min(h, w * (953 / 1920)));
    return { w: containerW, h: containerH };
  }
}

// Helper to determine the internal rendering resolution stepped snaps.
// Heights are proportional to the actual container aspect (no fixed aspect assumed).
function getRenderResolution(containerW, containerH) {
  const h = containerH || containerW * (900 / 1920); // fallback to 1920×900 aspect
  // Width ≥ 1280 px → render at 1920 wide
  if (containerW >= 1280) {
    return { w: 1920, h: Math.max(1, Math.round(1920 * h / containerW)) };
  }
  // Width 1024–1279 px → render at 1280 wide
  else if (containerW >= 1024) {
    return { w: 1280, h: Math.max(1, Math.round(1280 * h / containerW)) };
  }
  // Width < 1024 px → render at 1024 wide
  else {
    return { w: 1024, h: Math.max(1, Math.round(1024 * h / containerW)) };
  }
}

// Helper to scale ALL HUD components proportionally via a single CSS variable.
// Uses container width (== viewport width) as the reference so the scale is stable
// even in portrait orientations where height collapses.
function updateLayoutScale(containerW, containerH) {
  // Derive --layout-scale from the CSS layout viewport width (window.innerWidth).
  // Using the layout viewport (not visualViewport) makes all UI scale calculations
  // completely immune to pinch-zoom: the user can zoom in/out without moving or
  // resizing any HUD element or the 3D scene canvas.
  const lw = window.innerWidth || 1920;
  const scale = Math.max(0.35, lw / 1920);
  canvasContainer.style.setProperty('--layout-scale', scale);

  // Conch card scale: height-based (matches the original proven formula).
  // containerH comes from getContainerSize() which already uses window.innerHeight,
  // so it is also zoom-immune.
  if (askConchOverlay) {
    const cardScale = Math.max(0.6, Math.min(1.5, containerH / 900));
    askConchOverlay.style.setProperty('--conch-scale', cardScale);
  }
}

function onWindowResize() {
  const isVertical = window.innerHeight > window.innerWidth;
  const targetPath = isVertical ? '/Scene_Vertical.glb' : '/Scene_Desktop.glb';
  if (currentModelPath !== targetPath) {
    console.log('[Resize] Orientation changed, reloading model:', targetPath);
    loadModel(targetPath);
    return;
  }

  const size = getContainerSize();
  // Dynamic aspect from the actual container dimensions (CSS max-height may constrain height).
  const aspect = (size.h > 0) ? (size.w / size.h) : (1920 / 953);

  const isPortraitModel = currentModelPath && currentModelPath.includes('Vertical');
  let vFovDeg;
  if (isPortraitModel) {
    vFovDeg = 25.36; // Constant Vert+ for portrait camera
  } else {
    // Compute VFOV from the exact Blender HFOV (25.4°) so horizontal framing always matches.
    const hHalfRad = THREE.MathUtils.degToRad(DESIGN_HFOV_DEG / 2);
    vFovDeg = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalfRad) / aspect));
  }
  designFov = vFovDeg;

  [activeCamera, defaultCamera].forEach(cam => {
    if (cam && cam.isPerspectiveCamera) {
      cam.aspect = aspect;
      cam.fov = vFovDeg;
      cam.updateProjectionMatrix();
    }
  });

  // Update hudCamera (post-processing HUD mask) to keep it in sync
  if (hudCamera) {
    hudCamera.aspect = aspect;
    hudCamera.fov = vFovDeg;
    hudCamera.updateProjectionMatrix();
  }

  // Calculate stepped rendering resolution proportional to actual container
  const res = getRenderResolution(size.w, size.h);
  // renderer.setSize(w, h, updateStyle = false) preserves container-managed canvas CSS sizing
  renderer.setSize(res.w, res.h, false);

  const canvas = renderer.domElement;
  if (canvas) {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }

  // Update dynamic bokeh blur scale based on render target height to compensate for high DPI/vertical resolutions
  if (dofUniformBokehScale) {
    dofUniformBokehScale.value = CONFIG.dofBokehScale * (res.h / 953);
  }

  // Background meshes: reset to original Blender scale. No cover-scaling needed
  // since we don't modify the horizontal FOV.
  if (bgMeshes.length > 0) {
    for (const entry of bgMeshes) {
      entry.mesh.scale.set(entry.origScaleX, entry.origScaleY, entry.origScaleZ);
    }
  }

  // Adjust 3D scale of the wooden HUD banner components to match the HTML layout scale floor.
  // When width is narrower than 672px, --layout-scale is capped at 0.35, but the 3D scene
  // naturally scales down. By scaling up the 3D meshes by the mismatch ratio, they maintain
  // their design pixel size on screen, keeping the 3D wooden banner perfectly aligned with the
  // text and buttons.
  const lw = window.innerWidth || 1920;
  const actualScale = lw / 1920;
  const appliedScale = Math.max(0.35, actualScale);
  const mismatchRatio = appliedScale / actualScale;

  if (tablaHudMeshes.length > 0) {
    for (const entry of tablaHudMeshes) {
      entry.mesh.visible = false;
    }
  }

  // Calculate dynamic layout scaling based on container height
  updateLayoutScale(size.w, size.h);

  // Re-project the UI elements to match the new container size immediately
  updateButtonPosition();

  if (import.meta.env.DEV) {
    console.log('[Resize] Aspect locked:', aspect.toFixed(3), '| Container size:', size.w.toFixed(0) + 'x' + size.h.toFixed(0), '| Render buffer:', res.w + 'x' + res.h);
  }
}


// =============================================================================
// 7. DEPTH OF FIELD DEPTH – ONE-TIME CALCULATION
// =============================================================================
// The scene has a looping camera animation but the conch barely moves relative
// to the camera. We calculate the focus distance once after the scene settles
// (called from finishBenchmarking) and lock it — no per-frame CPU vector math.
function computeDofFocusOnce() {
  if (!activeCamera || !conchMesh) return;

  conchMesh.getWorldPosition(_conchWorldPos);
  activeCamera.getWorldPosition(_cameraWorldPos);
  activeCamera.getWorldDirection(_cameraForward);

  _toConch.copy(_conchWorldPos).sub(_cameraWorldPos);
  const projectedDistance = _toConch.dot(_cameraForward);

  if (projectedDistance > 0) {
    const nearLimit = activeCamera.near || 0.1;
    const farLimit = activeCamera.far || 500;
    CONFIG.dofFocus = Math.max(nearLimit, Math.min(projectedDistance, farLimit));
  }

  // Push the locked value into the uniform immediately
  if (dofUniformFocus) dofUniformFocus.value = CONFIG.dofFocus;

  console.log('[DoF] Focus locked at', CONFIG.dofFocus.toFixed(3),
    '| focalLength=', CONFIG.dofFocalLength,
    '| bokehScale=', CONFIG.dofBokehScale);
}


// =============================================================================
// 8. RENDER LOOP
// =============================================================================
function finishBenchmarking() {
  // Calculate average frame duration
  const sum = benchmarkFrameTimes.reduce((a, b) => a + b, 0);
  const avgDuration = sum / benchmarkFrameTimes.length;
  const calculatedFps = 1000 / avgDuration;
  console.log(`[Benchmark] Done. Avg frame duration: ${avgDuration.toFixed(2)}ms (~${calculatedFps.toFixed(1)} FPS)`);

  let targetProfile = currentProfileName;

  // If performance is absolutely terrible (average frame duration > 83.3ms, which is < 12 FPS),
  // it indicates a lack of hardware acceleration or a device that is too slow. Force the Low profile.
  if (avgDuration > 83.3) {
    console.warn(`[Graphics] Extremely poor performance during calibration: ${avgDuration.toFixed(2)}ms (~${calculatedFps.toFixed(1)} FPS). Forcing Low Quality.`);
    targetProfile = 'LOW';
  } else if (avgDuration > 35) {
    // If average frame time > 35ms (~28 FPS), drop to LOW
    targetProfile = 'LOW';
  } else if (avgDuration > 22) {
    // If average frame time > 22ms (~45 FPS) and we were in HIGH, drop to MEDIUM
    if (currentProfileName === 'HIGH') {
      targetProfile = 'MEDIUM';
    }
  }

  console.log(`[Benchmark] Calibrated Profile: ${targetProfile}`);
  if (targetProfile !== currentProfileName) {
    applyQualityProfile(targetProfile);
  }

  // Hide loading screen smoothly
  setProgress(100, 'Connected!');

  isBenchmarkFinished = true;

  // Spawn the gainers and losers bubbles
  spawnBubbles();

  if (preloader) {
    preloader.classList.add('fade-out');
    setTimeout(() => {
      preloader.style.display = 'none';
    }, 800); // matches CSS opacity transition
  }

  // Reveal interactive button and HUD icon
  if (topHudBar) topHudBar.classList.remove('hidden');
  if (askConchOverlay) askConchOverlay.classList.remove('hidden');
  if (hudBrandContainer) {
    hudBrandContainer.classList.remove('hidden');
  }

  // Lock the DoF focus distance now that the scene has fully settled.
  // This replaces the old per-frame updateDofDistance() — runs exactly once.
  computeDofFocusOnce();
}

function animate() {
  // FPS Throttling for LOW quality profile to reduce CPU load in software rendering mode
  if (!isBenchmarking && currentProfileName === 'LOW') {
    const now = performance.now();
    const elapsed = now - lastRenderTime;
    // Cap at 24 FPS (~41.67ms per frame) — cinematic minimum, smoother than 20 FPS
    if (elapsed < 41.67) {
      return;
    }
    lastRenderTime = now;
  }

  // Clamp delta to 50ms max — prevents large animation jumps after:
  //   a) FPS throttle skips accumulate multiple frames of clock time
  //   b) Tab loses focus and then regains it (browser pauses rAF)
  const delta = Math.min(clock.getDelta(), 0.05);

  if (mixer) mixer.update(delta);
  if (controls && controls.enabled) controls.update();

  // ── Sync hudCamera world matrix every frame ──────────────────────────────────
  // hudCamera is not in the scene graph, so its matrixWorld must be copied
  // manually after the animation mixer updates the GLB camera's transform.
  if (hudCamera && activeCamera) {
    activeCamera.updateWorldMatrix(true, false);
    hudCamera.matrixWorld.copy(activeCamera.matrixWorld);
    hudCamera.matrixWorldInverse.copy(activeCamera.matrixWorldInverse);
    hudCamera.projectionMatrix.copy(activeCamera.projectionMatrix);
    hudCamera.projectionMatrixInverse.copy(activeCamera.projectionMatrixInverse);
  }

  // DoF focus is calculated once at load time (see computeDofFocusOnce).
  // Only tone mapping exposure needs syncing here (CONFIG value never changes at runtime).
  renderer.toneMappingExposure = CONFIG.toneMappingExposure;

  // Live-sync outlines (allows thickness/color tweaking at runtime)
  if (outlineColorNode) outlineColorNode.value.setHex(CONFIG.outlineColor);
  if (outlineThicknessNode) outlineThicknessNode.value = CONFIG.outlineThickness;
  if (outlineAlphaNode) outlineAlphaNode.value = CONFIG.outlineAlpha;

  updateButtonPosition();

  // Render scene through the post-processing pipeline
  postProcessing.render();

  // Benchmarking & Warmup steps
  if (isBenchmarking) {
    const now = performance.now();
    const frameDuration = now - lastFrameTime;
    lastFrameTime = now;

    // Skip the first frame to ignore compile spike
    if (benchmarkFrameCount > 0) {
      benchmarkFrameTimes.push(frameDuration);
      const progressPct = 80 + Math.round((benchmarkFrameTimes.length / 15) * 20); // 80% to 100%
      setProgress(progressPct, `Calibrating Portal Graphics: ${benchmarkFrameTimes.length}/15`);
    }
    benchmarkFrameCount++;

    if (benchmarkFrameTimes.length >= 15) {
      isBenchmarking = false;
      finishBenchmarking();
    }
  } else if (warmupFrameCount !== -1) {
    warmupFrameCount++;
    if (warmupFrameCount >= WARMUP_FRAMES_LIMIT) {
      warmupFrameCount = -1; // stop warmup
      isBenchmarking = true;
      benchmarkFrameCount = 0;
      benchmarkFrameTimes.length = 0;
      lastFrameTime = performance.now();
    }
  }
}

const fetchWithTimeout = (url, timeout = 3500) => {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Request timed out'));
    }, timeout);

    fetch(url, { signal: controller.signal })
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

// =============================================================================
// 9. FLOATING BUBBLES WIDGET LOGIC
// =============================================================================
async function fetchTokenData() {
  // 1. Try local Vite proxy first (bypasses client-side CORS during local dev/testing)
  try {
    const response = await fetchWithTimeout('/api-icp/api/tokens', 3000);
    if (!response.ok) throw new Error('Proxy response not ok');
    const data = await response.json();
    processIcpTokensData(data);
    console.log('[Bubbles] Loaded tokens from icptokens.net (via local proxy):', tokenBubblesData);
    if (isBenchmarkFinished) {
      spawnBubbles();
    }
    return;
  } catch (err) {
    console.warn('[Bubbles] Local proxy failed, trying public CORS proxy:', err);
  }

  // 2. Try raw public CORS proxy as secondary fallback
  try {
    const response = await fetchWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://icptokens.net/api/tokens'), 4000);
    if (!response.ok) throw new Error('AllOrigins response not ok');
    const data = await response.json();
    processIcpTokensData(data);
    console.log('[Bubbles] Loaded tokens from icptokens.net (via AllOrigins proxy):', tokenBubblesData);
    if (isBenchmarkFinished) {
      spawnBubbles();
    }
    return;
  } catch (err) {
    console.warn('[Bubbles] Public CORS proxy failed, trying GeckoTerminal fallback:', err);
  }

  // 3. Fall back to GeckoTerminal if icptokens.net is completely unreachable
  try {
    const response = await fetchWithTimeout('https://api.geckoterminal.com/api/v2/networks/icp/pools?page=1&include=base_token', 4000);
    if (!response.ok) throw new Error('GeckoTerminal response not ok');
    const data = await response.json();

    const logoMap = {};
    if (data.included) {
      data.included.forEach(item => {
        if (item.attributes && item.attributes.image_url) {
          logoMap[item.id] = item.attributes.image_url;
        }
      });
    }

    const seenTokens = new Set();
    const uniquePools = [];
    data.data.forEach(pool => {
      const baseTokenId = pool.relationships.base_token.data.id;
      const baseSymbol = pool.attributes.name.split(' / ')[0].toUpperCase();
      const change24h = pool.attributes.price_change_percentage.h24;
      
      if (
        !seenTokens.has(baseTokenId) &&
        change24h !== null &&
        change24h !== undefined &&
        baseSymbol !== 'ICP' &&
        baseSymbol !== 'USDT' &&
        baseSymbol !== 'USDC' &&
        baseSymbol !== 'CKUSDT' &&
        baseSymbol !== 'CKUSDC'
      ) {
        seenTokens.add(baseTokenId);
        uniquePools.push(pool);
      }
    });

    const sorted = [...uniquePools].sort((a, b) => {
      const aChange = parseFloat(a.attributes.price_change_percentage.h24) || 0;
      const bChange = parseFloat(b.attributes.price_change_percentage.h24) || 0;
      return bChange - aChange;
    });

    if (sorted.length < 6) throw new Error('Not enough unique tokens returned');

    const gainers = sorted.slice(0, 3).map(pool => {
      const baseTokenId = pool.relationships.base_token.data.id;
      const symbol = pool.attributes.name.split(' / ')[0];
      const change = parseFloat(pool.attributes.price_change_percentage.h24) || 0;
      const logo = logoMap[baseTokenId] || null;
      return { 
        symbol, 
        logo, 
        change, 
        isGainer: true, 
        url: `https://www.geckoterminal.com/icp/pools/${pool.attributes.address}`
      };
    });

    const losers = sorted.slice(-3).map(pool => {
      const baseTokenId = pool.relationships.base_token.data.id;
      const symbol = pool.attributes.name.split(' / ')[0];
      const change = parseFloat(pool.attributes.price_change_percentage.h24) || 0;
      const logo = logoMap[baseTokenId] || null;
      return { 
        symbol, 
        logo, 
        change, 
        isGainer: false, 
        url: `https://www.geckoterminal.com/icp/pools/${pool.attributes.address}`
      };
    });

    tokenBubblesData = [...gainers, ...losers];
    console.log('[Bubbles] Loaded tokens from GeckoTerminal:', tokenBubblesData);
  } catch (err) {
    console.warn('[Bubbles] Failed to fetch token data, using static fallbacks:', err);
    tokenBubblesData = [
      { symbol: 'NAK', logo: null, change: 24.5, isGainer: true },
      { symbol: 'EXE', logo: null, change: 12.8, isGainer: true },
      { symbol: 'CHAT', logo: null, change: 8.2, isGainer: true },
      { symbol: 'GHOST', logo: null, change: -5.4, isGainer: false },
      { symbol: 'OGY', logo: null, change: -8.9, isGainer: false },
      { symbol: 'BOB', logo: null, change: -15.2, isGainer: false }
    ];
  } finally {
    if (isBenchmarkFinished) {
      spawnBubbles();
    }
  }
}

function processIcpTokensData(data) {
  // Filter valid tokens using loose comparison for numerical flags (1/0) from API
  const validTokens = data.filter(token => {
    return token.is_published == 1 &&
           token.is_deprecated != 1 &&
           token.metrics &&
           token.metrics.change &&
           token.metrics.change['24h'] &&
           typeof token.metrics.change['24h'].usd === 'number' &&
           token.logo &&
           token.symbol;
  });

  // Filter out stablecoins or base coins to keep it to active ecosystem tokens
  const filteredTokens = validTokens.filter(token => {
    const sym = token.symbol.toUpperCase();
    return sym !== 'ICP' && sym !== 'USDT' && sym !== 'USDC' && sym !== 'CKUSDT' && sym !== 'CKUSDC';
  });

  // Sort by 24h USD change descending
  const sorted = [...filteredTokens].sort((a, b) => b.metrics.change['24h'].usd - a.metrics.change['24h'].usd);

  if (sorted.length < 6) throw new Error('Not enough tokens');

  const gainers = sorted.slice(0, 3).map(t => ({
    symbol: t.symbol,
    logo: `https://icptokens.net/storage/${t.logo}`,
    change: t.metrics.change['24h'].usd,
    isGainer: true,
    url: `https://icptokens.net/token/${t.canister_id}`
  }));

  const losers = sorted.slice(-3).map(t => ({
    symbol: t.symbol,
    logo: `https://icptokens.net/storage/${t.logo}`,
    change: t.metrics.change['24h'].usd,
    isGainer: false,
    url: `https://icptokens.net/token/${t.canister_id}`
  }));

  // Look for the promo token in the raw API data to get live stats
  if (bubble_promo && bubble_promo.enabled) {
    const foundPromo = data.find(t => t.canister_id === bubble_promo.canisterId);
    if (foundPromo) {
      bubble_promo.symbol = foundPromo.symbol;
      bubble_promo.logo = `https://icptokens.net/storage/${foundPromo.logo}`;
      bubble_promo.change = foundPromo.metrics?.change['24h']?.usd || 0;
    }
  }

  tokenBubblesData = [...gainers, ...losers];
}

function spawnBubbles() {
  if (!isBenchmarkFinished) return;

  const container = document.getElementById('bubbles-container');
  if (!container) return;

  // Clear any existing bubbles
  container.innerHTML = '';

  const bubblesToSpawn = [...tokenBubblesData];
  if (bubble_promo && bubble_promo.enabled) {
    const promoChange = bubble_promo.change !== null ? bubble_promo.change : 24.5;
    bubblesToSpawn.push({
      symbol: bubble_promo.symbol || 'NAK',
      logo: bubble_promo.logo,
      change: promoChange,
      isGainer: promoChange >= 0,
      url: bubble_promo.url || `https://icptokens.net/token/${bubble_promo.canisterId}`,
      isPromo: true
    });
  }

  if (bubblesToSpawn.length === 0) {
    console.warn('[Bubbles] No token data available to spawn bubbles.');
    return;
  }

  bubblesToSpawn.forEach((token, index) => {
    // Create outer bubble-item
    const bubbleItem = document.createElement('div');
    bubbleItem.className = 'bubble-item';

    // Create inner bubble-inner
    const bubbleInner = document.createElement('div');
    bubbleInner.className = 'bubble-inner';

    // Create content wrapper
    const bubbleContent = document.createElement('div');
    bubbleContent.className = 'bubble-content';
    if (token.isPromo) {
      bubbleContent.classList.add('promo');
    }

    // Randomize properties:
    // 1. Size: 145px for promo bubble (Noticeably larger! Normal is 80px to 115px)
    const size = token.isPromo 
      ? 145 
      : Math.floor(Math.random() * 35) + 80;
    bubbleItem.style.width = `${size}px`;
    bubbleItem.style.height = `${size}px`;

    // 2. Horizontal starting position (left offset) between 5% and 85%
    let leftPos;
    if (token.isPromo) {
      // Promo bubble spawns randomly anywhere across the full page
      leftPos = Math.floor(Math.random() * 80) + 5;
    } else {
      // Regular bubbles distribute depending on their index to prevent cluster overlap
      const sectionWidth = 80 / bubblesToSpawn.length;
      leftPos = Math.floor(index * sectionWidth + Math.random() * sectionWidth + 10);
    }
    bubbleItem.style.left = `${leftPos}%`;

    // 3. Vertical rise animation duration between 12s and 20s
    const floatDuration = Math.random() * 8 + 12;
    bubbleItem.style.animationDuration = `${floatDuration}s`;

    // 4. Horizontal sway animation duration between 3s and 6s
    const swayDuration = Math.random() * 3 + 3;
    bubbleInner.style.animationDuration = `${swayDuration}s`;

    // 5. Negative animation delay so they start immediately at different heights
    const delay = -Math.random() * floatDuration;
    bubbleItem.style.animationDelay = `${delay}s`;
    
    // Random delay for horizontal sway as well to prevent in-sync swaying
    const swayDelay = -Math.random() * swayDuration;
    bubbleInner.style.animationDelay = `${swayDelay}s`;

    // Build internal elements
    // Ticker symbol
    const ticker = document.createElement('div');
    const isGainer = token.isGainer;
    ticker.className = `bubble-ticker ${isGainer ? 'gainer' : 'loser'}`;
    ticker.textContent = token.symbol.startsWith('$') ? token.symbol : `$${token.symbol}`;

    // Token Logo
    const logo = document.createElement('img');
    logo.className = 'bubble-logo';
    logo.src = token.logo ? token.logo : '/icon%2050x50/0001.webp';
    logo.alt = token.symbol;
    // Fallback if image fails to load
    logo.onerror = () => {
      logo.src = '/icon%2050x50/0001.webp';
    };

    // Percentage change
    const change = document.createElement('div');
    change.className = `bubble-change ${isGainer ? 'gainer' : 'loser'}`;
    const formattedChange = token.change > 0 ? `+${token.change.toFixed(1)}%` : `${token.change.toFixed(1)}%`;
    change.textContent = formattedChange;

    // Click event to navigate to token details page
    bubbleContent.addEventListener('click', () => {
      const url = token.url ? token.url : `https://icptokens.net/`;
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    // Assemble
    bubbleContent.appendChild(ticker);
    bubbleContent.appendChild(logo);
    bubbleContent.appendChild(change);

    bubbleInner.appendChild(bubbleContent);
    bubbleItem.appendChild(bubbleInner);
    container.appendChild(bubbleItem);
  });
}

// =============================================================================
// START
// =============================================================================
init();

