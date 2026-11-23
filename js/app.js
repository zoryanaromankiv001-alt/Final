/**
 * ColonyVision Lab: Main UI Application Controller
 * Author: Zoryana Pihach Romankiv (CAI 2840 - Introduction to Computer Vision)
 *
 * Coordinates Web Worker vision processing, IndexedDB persistence,
 * interactive canvas inspection, camera capture, and laboratory reporting.
 */

import { createVisionClient } from './vision-client.js';
import * as db from './db.js';

// Application State
const state = {
  client: null,
  currentBitmap: null,
  currentImageSource: null, // HTMLImageElement or ImageBitmap
  currentOriginalBlob: null,
  currentResult: null,
  currentExperimentId: null,
  activeView: 'annotated', // 'annotated' | 'original' | 'mask' | 'heatmap'
  hoveredColony: null,
  dilutionFactor: 1e-4,
  dilutionExponent: -4,
  platedVolumeMl: 0.1,
  agarType: 'auto',
  userOverrides: {
    added: [], // array of { x, y, r, area, circularity, category }
    deletedIds: new Set()
  },
  params: {
    blockSize: 25,
    thresholdC: 8,
    blurSize: 5,
    minRadius: 3,
    maxRadius: 80,
    minCircularity: 0.40,
    dishMode: 'auto',
    separateTouching: true
  }
};

// DOM References
const elements = {
  stage: document.getElementById('stage'),
  promptZone: document.getElementById('prompt-zone'),
  workbench: document.getElementById('workbench'),
  fileInput: document.getElementById('file-input'),
  chooseBtn: document.getElementById('choose-btn'),
  promptChooseBtn: document.getElementById('prompt-choose-btn'),
  cameraBtn: document.getElementById('camera-btn'),
  promptCameraBtn: document.getElementById('prompt-camera-btn'),
  cameraDialog: document.getElementById('camera-dialog'),
  cameraFeed: document.getElementById('camera-feed'),
  cameraCaptureBtn: document.getElementById('camera-capture-btn'),
  cameraCloseBtn: document.getElementById('camera-close-btn'),
  mainCanvas: document.getElementById('main-canvas'),
  colonyTooltip: document.getElementById('colony-tooltip'),
  statusPill: document.getElementById('status-pill'),
  statusText: document.getElementById('status-text'),
  expTitleInput: document.getElementById('exp-title-input'),
  sampleNameBadge: document.getElementById('sample-name-badge'),
  // Metric elements
  metricCfuCount: document.getElementById('metric-cfu-count'),
  metricCfuMl: document.getElementById('metric-cfu-ml'),
  metricDensity: document.getElementById('metric-density'),
  metricSpeed: document.getElementById('metric-speed'),
  metricCircularity: document.getElementById('metric-circularity'),
  metricAvgArea: document.getElementById('metric-avg-area'),
  // Sliders & Controls
  sliderSensitivity: document.getElementById('slider-sensitivity'),
  valSensitivity: document.getElementById('val-sensitivity'),
  sliderMinRadius: document.getElementById('slider-min-radius'),
  valMinRadius: document.getElementById('val-min-radius'),
  sliderMaxRadius: document.getElementById('slider-max-radius'),
  valMaxRadius: document.getElementById('val-max-radius'),
  sliderCircularity: document.getElementById('slider-circularity'),
  valCircularity: document.getElementById('val-circularity'),
  selectDilution: document.getElementById('select-dilution'),
  selectVolume: document.getElementById('select-volume'),
  selectAgar: document.getElementById('select-agar'),
  // Category Bars
  barPunctiform: document.getElementById('bar-punctiform'),
  cntPunctiform: document.getElementById('cnt-punctiform'),
  barSmall: document.getElementById('bar-small'),
  cntSmall: document.getElementById('cnt-small'),
  barMedium: document.getElementById('bar-medium'),
  cntMedium: document.getElementById('cnt-medium'),
  barLarge: document.getElementById('bar-large'),
  cntLarge: document.getElementById('cnt-large'),
  // Action Buttons
  btnSaveExp: document.getElementById('btn-save-exp'),
  btnDownloadPng: document.getElementById('btn-download-png'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  btnPrintReport: document.getElementById('btn-print-report'),
  btnScanAnother: document.getElementById('btn-scan-another'),
  // Library Elements
  libraryGrid: document.getElementById('library-grid'),
  libraryCount: document.getElementById('library-count'),
  librarySearch: document.getElementById('library-search'),
  resetConfirmDialog: document.getElementById('reset-confirm-dialog'),
  btnResetApp: document.getElementById('btn-reset-app'),
  btnConfirmReset: document.getElementById('btn-confirm-reset'),
  btnCancelReset: document.getElementById('btn-cancel-reset'),
  toastContainer: document.getElementById('toast-container')
};

/**
 * Display toast notification
 */
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Initialize Web Worker Vision Client
 */
function initVisionClient() {
  state.client = createVisionClient();

  state.client.onStatus((status, detail) => {
    if (status === 'loading') {
      elements.statusPill.setAttribute('data-state', 'busy');
      elements.statusText.textContent = 'Compiling OpenCV WebAssembly…';
    } else if (status === 'ready') {
      elements.statusPill.setAttribute('data-state', 'ready');
      elements.statusText.textContent = 'ColonyVision Wasm 4.12.0 Ready';
    } else if (status === 'failed') {
      elements.statusPill.setAttribute('data-state', 'error');
      elements.statusText.textContent = 'WebAssembly Error';
      showToast('Vision Worker error: ' + ((detail && detail.message) || detail));
    }
  });
}

/**
 * Load an image from URL or Blob and run analysis
 */
async function processImageSource(imageSource, originalBlob, sampleName = 'Colony Specimen') {
  elements.statusPill.setAttribute('data-state', 'busy');
  elements.statusText.textContent = 'Processing plate with OpenCV…';

  state.currentOriginalBlob = originalBlob;
  state.currentExperimentId = `exp_${Date.now()}`;
  elements.expTitleInput.value = sampleName;
  state.userOverrides.added = [];
  state.userOverrides.deletedIds.clear();

  // Create ImageBitmap
  let bitmap;
  if (imageSource instanceof ImageBitmap) {
    bitmap = imageSource;
  } else if (imageSource instanceof Blob) {
    bitmap = await createImageBitmap(imageSource);
  } else if (imageSource instanceof HTMLImageElement) {
    bitmap = await createImageBitmap(imageSource);
  }

  // Keep a copy of bitmap for redraws/original view
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  state.currentImageSource = canvas;

  // Run worker analysis
  try {
    const workerBitmap = await createImageBitmap(canvas);
    const result = await state.client.analyze(
      workerBitmap,
      {
        agarType: state.agarType,
        blurSize: state.params.blurSize,
        blockSize: state.params.blockSize,
        thresholdC: state.params.thresholdC,
        minRadius: state.params.minRadius,
        maxRadius: state.params.maxRadius,
        minCircularity: state.params.minCircularity,
        dishMode: state.params.dishMode,
        separateTouching: state.params.separateTouching
      },
      (stage) => {
        elements.statusText.textContent = stage;
      }
    );

    state.currentResult = result;
    elements.statusPill.setAttribute('data-state', 'ready');
    elements.statusText.textContent = `Completed in ${result.timing.totalMs}ms (Wasm)`;

    // Switch view from prompt to workbench
    elements.promptZone.hidden = true;
    elements.workbench.hidden = false;

    updateMetricsAndUI();
    renderMainCanvas();
  } catch (err) {
    elements.statusPill.setAttribute('data-state', 'error');
    elements.statusText.textContent = 'Analysis Failed';
    showToast('Analysis error: ' + err.message);
  }
}

/**
 * Filter and compute effective colonies taking user overrides into account
 */
function getEffectiveColonies() {
  if (!state.currentResult || !state.currentResult.colonies) return [];
  const base = state.currentResult.colonies.filter(
    (c) => !state.userOverrides.deletedIds.has(c.id)
  );
  return base.concat(state.userOverrides.added);
}

/**
 * Update UI metrics, category histogram bars, and dilution calculations
 */
function updateMetricsAndUI() {
  const colonies = getEffectiveColonies();
  const count = colonies.length;

  // 1. CFU Concentration calculation: CFU/mL = (Count / Volume_mL) * (1 / Dilution)
  // e.g. Count = 84, Volume = 0.1 mL, Dilution = 10^-4 => CFU/mL = (84 / 0.1) * 10^4 = 8.4 x 10^6
  const dilutionInverse = Math.pow(10, -state.dilutionExponent);
  const cfuPerMl = state.platedVolumeMl > 0 ? (count / state.platedVolumeMl) * dilutionInverse : 0;

  // Format CFU/mL scientifically
  let formattedCfuMl = '0';
  if (cfuPerMl > 0) {
    const exp = Math.floor(Math.log10(cfuPerMl));
    const mantissa = (cfuPerMl / Math.pow(10, exp)).toFixed(2);
    formattedCfuMl = `${mantissa} × 10<sup>${exp}</sup>`;
  }

  // 2. Average metrics
  let totalArea = 0;
  let totalCirc = 0;
  const categories = { punctiform: 0, small: 0, medium: 0, large: 0 };

  for (const c of colonies) {
    totalArea += c.area;
    totalCirc += c.circularity;
    if (categories[c.category] !== undefined) {
      categories[c.category]++;
    } else {
      categories.punctiform++;
    }
  }

  const avgArea = count > 0 ? Math.round((totalArea / count) * 10) / 10 : 0;
  const avgCirc = count > 0 ? Math.round((totalCirc / count) * 100) / 100 : 0;

  // 3. Density (CFU / cm^2) on standard 90mm plate (63.6 cm^2)
  const dishAreaCm2 = (state.currentResult && state.currentResult.stats && state.currentResult.stats.dishAreaCm2) || 63.6;
  const density = Math.round((count / dishAreaCm2) * 10) / 10;

  // Render to DOM
  elements.metricCfuCount.textContent = count;
  elements.metricCfuMl.innerHTML = formattedCfuMl;
  elements.metricDensity.textContent = `${density} /cm²`;
  elements.metricSpeed.textContent = state.currentResult ? `${state.currentResult.timing.totalMs} ms` : '—';
  elements.metricCircularity.textContent = avgCirc > 0 ? avgCirc.toFixed(2) : '—';
  elements.metricAvgArea.textContent = avgArea > 0 ? `${avgArea} px²` : '—';

  // Category Bars
  const maxCatCount = Math.max(1, count);
  elements.cntPunctiform.textContent = categories.punctiform;
  elements.barPunctiform.style.width = `${(categories.punctiform / maxCatCount) * 100}%`;

  elements.cntSmall.textContent = categories.small;
  elements.barSmall.style.width = `${(categories.small / maxCatCount) * 100}%`;

  elements.cntMedium.textContent = categories.medium;
  elements.barMedium.style.width = `${(categories.medium / maxCatCount) * 100}%`;

  elements.cntLarge.textContent = categories.large;
  elements.barLarge.style.width = `${(categories.large / maxCatCount) * 100}%`;
}

/**
 * Render Main Interactive Canvas
 */
function renderMainCanvas() {
  if (!state.currentImageSource) return;

  const canvas = elements.mainCanvas;
  const ctx = canvas.getContext('2d');
  const src = state.currentImageSource;

  const w = src.width;
  const h = src.height;
  canvas.width = w;
  canvas.height = h;

  ctx.clearRect(0, 0, w, h);

  // View: Original
  if (state.activeView === 'original') {
    ctx.drawImage(src, 0, 0);
    return;
  }

  // View: Binary Mask
  if (state.activeView === 'mask' && state.currentResult && state.currentResult.maskData) {
    const maskImgData = new ImageData(
      new Uint8ClampedArray(state.currentResult.maskData),
      state.currentResult.maskWidth,
      state.currentResult.maskHeight
    );
    ctx.putImageData(maskImgData, 0, 0);
    return;
  }

  // View: Heatmap Density
  if (state.activeView === 'heatmap') {
    ctx.drawImage(src, 0, 0);
    renderDensityHeatmap(ctx, w, h);
    return;
  }

  // View: Annotated (Default)
  ctx.drawImage(src, 0, 0);

  // Draw circular petri dish boundary if detected
  if (state.currentResult && state.currentResult.dish && state.currentResult.dish.detected) {
    const dish = state.currentResult.dish;
    ctx.save();
    ctx.beginPath();
    ctx.arc(dish.cx, dish.cy, dish.r, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0, 113, 227, 0.45)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.stroke();

    // Dish label
    ctx.font = '600 13px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(0, 113, 227, 0.8)';
    ctx.fillText('Petri Dish ROI (90mm)', dish.cx - 65, dish.cy - dish.r + 20);
    ctx.restore();
  }

  // Draw detected colonies
  const colonies = getEffectiveColonies();
  for (const c of colonies) {
    const isHovered = state.hoveredColony && state.hoveredColony.id === c.id;

    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(c.r, 4), 0, 2 * Math.PI);

    // Color by biological size category
    let strokeColor = '#34c759'; // Punctiform (green)
    if (c.category === 'small') strokeColor = '#0071e3'; // Small (blue)
    else if (c.category === 'medium') strokeColor = '#ff9500'; // Medium (orange)
    else if (c.category === 'large') strokeColor = '#af52de'; // Large (purple)

    if (isHovered) {
      // Glowing highlight
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.fillStyle = strokeColor.replace('rgb', 'rgba').replace(')', ', 0.35)');
      ctx.fill();
    } else {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.0;
    }

    ctx.stroke();

    // Centroid dot
    ctx.beginPath();
    ctx.arc(c.x, c.y, 1.5, 0, 2 * Math.PI);
    ctx.fillStyle = strokeColor;
    ctx.fill();

    // Tiny colony number on larger colonies or when hovered
    if (c.r >= 8 || isHovered) {
      ctx.font = '500 10px -apple-system, monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(c.id), c.x + c.r + 2, c.y + 3);
    }

    ctx.restore();
  }
}

/**
 * Render density heatmap overlay
 */
function renderDensityHeatmap(ctx, w, h) {
  const colonies = getEffectiveColonies();
  if (colonies.length === 0) return;

  const heatCanvas = document.createElement('canvas');
  heatCanvas.width = w;
  heatCanvas.height = h;
  const hCtx = heatCanvas.getContext('2d');

  for (const c of colonies) {
    const rad = 45;
    const grad = hCtx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rad);
    grad.addColorStop(0, 'rgba(255, 59, 48, 0.45)');
    grad.addColorStop(0.5, 'rgba(255, 149, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 113, 227, 0)');
    hCtx.fillStyle = grad;
    hCtx.beginPath();
    hCtx.arc(c.x, c.y, rad, 0, 2 * Math.PI);
    hCtx.fill();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(heatCanvas, 0, 0);
  ctx.restore();
}

/**
 * Interactive Canvas Mouse Events: Hover Tooltip & Click Editing
 */
function setupCanvasInteractions() {
  const canvas = elements.mainCanvas;
  const tooltip = elements.colonyTooltip;

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      clientX: e.clientX,
      clientY: e.clientY
    };
  }

  function findColonyAt(x, y) {
    const colonies = getEffectiveColonies();
    for (let i = colonies.length - 1; i >= 0; i--) {
      const c = colonies[i];
      const dist = Math.hypot(x - c.x, y - c.y);
      if (dist <= Math.max(c.r + 4, 8)) {
        return c;
      }
    }
    return null;
  }

  canvas.addEventListener('mousemove', (e) => {
    if (state.activeView !== 'annotated') {
      tooltip.hidden = true;
      return;
    }

    const { x, y, clientX, clientY } = getCanvasCoords(e);
    const colony = findColonyAt(x, y);

    if (colony) {
      state.hoveredColony = colony;
      canvas.style.cursor = 'pointer';

      // Update tooltip
      tooltip.hidden = false;
      tooltip.style.left = `${clientX}px`;
      tooltip.style.top = `${clientY}px`;

      const badgeClass = `badge-${colony.category}`;
      tooltip.innerHTML = `
        <strong>Colony #${colony.id}</strong><br>
        Area: ${colony.area} px² · Radius: ${colony.r} px<br>
        Circularity: ${(colony.circularity * 100).toFixed(0)}% (${colony.circularity})<br>
        <span class="badge ${badgeClass}">${colony.category}</span>
        <div style="font-size:0.7rem; color:#aaa; margin-top:3px;">Click to delete / toggle</div>
      `;
      renderMainCanvas();
    } else {
      if (state.hoveredColony) {
        state.hoveredColony = null;
        renderMainCanvas();
      }
      tooltip.hidden = true;
      canvas.style.cursor = 'crosshair';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    state.hoveredColony = null;
    tooltip.hidden = true;
    renderMainCanvas();
  });

  canvas.addEventListener('click', (e) => {
    if (state.activeView !== 'annotated') return;

    const { x, y } = getCanvasCoords(e);
    const existing = findColonyAt(x, y);

    if (existing) {
      // Toggle deletion of colony (Human-in-the-loop false positive removal)
      if (existing.isManual) {
        state.userOverrides.added = state.userOverrides.added.filter((c) => c.id !== existing.id);
      } else {
        state.userOverrides.deletedIds.add(existing.id);
      }
      showToast(`Removed Colony #${existing.id}`);
    } else {
      // Add manual colony
      const newId = 1000 + state.userOverrides.added.length + 1;
      const manualColony = {
        id: newId,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        r: 6.0,
        area: Math.round(Math.PI * 36 * 10) / 10,
        perimeter: Math.round(2 * Math.PI * 6 * 10) / 10,
        circularity: 1.0,
        category: 'small',
        isManual: true
      };
      state.userOverrides.added.push(manualColony);
      showToast(`Added Colony #${newId} at (${Math.round(x)}, ${Math.round(y)})`);
    }

    updateMetricsAndUI();
    renderMainCanvas();
  });
}

/**
 * Re-run analysis with current slider parameters (debounced)
 */
let debounceTimer = null;
function triggerReanalysis() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (!state.currentImageSource) return;
    elements.statusPill.setAttribute('data-state', 'busy');
    elements.statusText.textContent = 'Updating OpenCV parameters…';

    try {
      const bitmap = await createImageBitmap(state.currentImageSource);
      const result = await state.client.analyze(bitmap, {
        agarType: state.agarType,
        blurSize: state.params.blurSize,
        blockSize: state.params.blockSize,
        thresholdC: state.params.thresholdC,
        minRadius: state.params.minRadius,
        maxRadius: state.params.maxRadius,
        minCircularity: state.params.minCircularity,
        dishMode: state.params.dishMode,
        separateTouching: state.params.separateTouching
      });

      state.currentResult = result;
      elements.statusPill.setAttribute('data-state', 'ready');
      elements.statusText.textContent = `Wasm: ${result.timing.totalMs}ms`;

      updateMetricsAndUI();
      renderMainCanvas();
    } catch (err) {
      elements.statusPill.setAttribute('data-state', 'error');
      showToast('Reanalysis error: ' + err.message);
    }
  }, 180);
}

/**
 * Save current experiment into IndexedDB
 */
async function saveCurrentExperiment() {
  if (!state.currentResult || !state.currentImageSource) {
    showToast('No active experiment to save.');
    return;
  }

  try {
    elements.statusPill.setAttribute('data-state', 'busy');
    elements.statusText.textContent = 'Saving to IndexedDB…';

    // 1. Generate annotated result Blob from main canvas
    const annotatedBlob = await new Promise((res) => elements.mainCanvas.toBlob(res, 'image/png'));

    // 2. Generate small thumbnail Blob (320px)
    const thumbCanvas = document.createElement('canvas');
    const scale = 320 / elements.mainCanvas.width;
    thumbCanvas.width = 320;
    thumbCanvas.height = Math.round(elements.mainCanvas.height * scale);
    const tCtx = thumbCanvas.getContext('2d');
    tCtx.drawImage(elements.mainCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const thumbBlob = await new Promise((res) => thumbCanvas.toBlob(res, 'image/jpeg', 0.85));

    const colonies = getEffectiveColonies();
    const expRecord = {
      id: state.currentExperimentId,
      name: elements.expTitleInput.value.trim() || 'Untitled Assay',
      agarType: state.agarType,
      dilutionFactor: `10^${state.dilutionExponent}`,
      platedVolumeMl: state.platedVolumeMl,
      colonyCount: colonies.length,
      cfuPerMl: elements.metricCfuMl.innerText,
      stats: {
        meanArea: elements.metricAvgArea.textContent,
        meanCircularity: elements.metricCircularity.textContent,
        density: elements.metricDensity.textContent
      },
      colonies,
      dish: state.currentResult.dish,
      timing: state.currentResult.timing,
      thresholdParams: state.params,
      originalBlob: state.currentOriginalBlob,
      annotatedBlob,
      thumbBlob
    };

    await db.saveExperiment(expRecord);
    elements.statusPill.setAttribute('data-state', 'ready');
    elements.statusText.textContent = 'Saved to IndexedDB';
    showToast('Experiment saved to Lab Notebook!');
    await refreshLibraryUI();
  } catch (err) {
    elements.statusPill.setAttribute('data-state', 'error');
    showToast('Failed to save experiment: ' + err.message);
  }
}

/**
 * Refresh the Library UI from IndexedDB
 */
async function refreshLibraryUI() {
  try {
    const experiments = await db.getAllExperiments();
    elements.libraryCount.textContent = `(${experiments.length})`;
    elements.libraryGrid.innerHTML = '';

    if (experiments.length === 0) {
      elements.libraryGrid.innerHTML = `
        <li style="grid-column: 1/-1; text-align: center; color: var(--text-2); padding: 32px;">
          No saved experiments yet. Analyze a sample plate above to save your first experiment.
        </li>
      `;
      return;
    }

    const searchQuery = (elements.librarySearch.value || '').toLowerCase().trim();

    for (const exp of experiments) {
      if (searchQuery && !exp.name.toLowerCase().includes(searchQuery)) {
        continue;
      }

      const card = document.createElement('li');
      card.className = 'exp-card';

      const thumbUrl = exp.thumbBlob ? URL.createObjectURL(exp.thumbBlob) : '';
      const dateStr = new Date(exp.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      card.innerHTML = `
        <img class="exp-thumb" src="${thumbUrl}" alt="Thumbnail of ${exp.name}" loading="lazy">
        <div class="exp-body">
          <div class="exp-name">${exp.name}</div>
          <div class="exp-meta">
            <span>${dateStr}</span>
            <span>Dilution ${exp.dilutionFactor}</span>
          </div>
          <div class="exp-cfu-badge">${exp.colonyCount} CFUs (${exp.cfuPerMl} CFU/mL)</div>
          <div class="exp-actions">
            <button type="button" class="btn-load" data-id="${exp.id}">Open</button>
            <button type="button" class="btn-csv" data-id="${exp.id}">CSV</button>
            <button type="button" class="btn-del" data-id="${exp.id}">Delete</button>
          </div>
        </div>
      `;

      card.querySelector('.btn-load').addEventListener('click', () => loadExperiment(exp.id));
      card.querySelector('.btn-csv').addEventListener('click', () => exportSingleExperimentCsv(exp));
      card.querySelector('.btn-del').addEventListener('click', () => deleteExperimentPrompt(exp.id));

      elements.libraryGrid.appendChild(card);
    }
  } catch (err) {
    console.error('Failed to refresh library:', err);
  }
}

/**
 * Load a past experiment from IndexedDB into active workbench
 */
async function loadExperiment(id) {
  try {
    const exp = await db.getExperiment(id);
    if (!exp) return;

    if (exp.originalBlob) {
      await processImageSource(exp.originalBlob, exp.originalBlob, exp.name);
      elements.expTitleInput.value = exp.name;
      showToast(`Loaded ${exp.name}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) {
    showToast('Failed to load experiment: ' + err.message);
  }
}

/**
 * Delete experiment with confirmation
 */
async function deleteExperimentPrompt(id) {
  if (confirm('Delete this experiment from IndexedDB? This cannot be undone.')) {
    await db.deleteExperiment(id);
    showToast('Experiment deleted.');
    await refreshLibraryUI();
  }
}

/**
 * Export colonies as CSV spreadsheet
 */
function exportColoniesCsv() {
  const colonies = getEffectiveColonies();
  if (colonies.length === 0) {
    showToast('No detected colonies to export.');
    return;
  }

  const expName = elements.expTitleInput.value.trim() || 'colony_experiment';
  let csv = 'Colony_ID,Centroid_X_px,Centroid_Y_px,Radius_px,Area_px2,Perimeter_px,Circularity,Size_Class,Manual_Entry\n';

  for (const c of colonies) {
    csv += `${c.id},${c.x},${c.y},${c.r},${c.area},${c.perimeter},${c.circularity},${c.category},${c.isManual ? 'YES' : 'NO'}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${expName.replace(/[^a-z0-9_-]/gi, '_')}_colonies.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded colony morphometry CSV!');
}

function exportSingleExperimentCsv(exp) {
  const colonies = exp.colonies || [];
  let csv = 'Colony_ID,Centroid_X_px,Centroid_Y_px,Radius_px,Area_px2,Perimeter_px,Circularity,Size_Class\n';
  for (const c of colonies) {
    csv += `${c.id},${c.x},${c.y},${c.r},${c.area},${c.perimeter},${c.circularity},${c.category}\n`;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exp.name.replace(/[^a-z0-9_-]/gi, '_')}_colonies.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download high-resolution annotated image
 */
function downloadAnnotatedImage() {
  if (!elements.mainCanvas) return;
  const expName = elements.expTitleInput.value.trim() || 'colony_scan';
  const url = elements.mainCanvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${expName.replace(/[^a-z0-9_-]/gi, '_')}_scan.png`;
  a.click();
  showToast('Downloaded high-resolution scan!');
}

/**
 * Setup Camera Capture
 */
let cameraStream = null;
function setupCamera() {
  async function openCamera() {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      elements.cameraFeed.srcObject = cameraStream;
      elements.cameraFeed.play();
      elements.cameraDialog.showModal();
    } catch (err) {
      showToast('Camera access denied or unavailable: ' + err.message);
    }
  }

  function closeCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    elements.cameraDialog.close();
  }

  elements.cameraBtn.addEventListener('click', openCamera);
  elements.promptCameraBtn.addEventListener('click', openCamera);
  elements.cameraCloseBtn.addEventListener('click', closeCamera);

  elements.cameraCaptureBtn.addEventListener('click', async () => {
    const video = elements.cameraFeed;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    closeCamera();
    canvas.toBlob(async (blob) => {
      await processImageSource(blob, blob, 'Camera Plate Capture');
    }, 'image/jpeg', 0.95);
  });
}

/**
 * Wire UI Event Listeners
 */
function setupEventListeners() {
  // File Picker
  const triggerPicker = () => elements.fileInput.click();
  elements.chooseBtn.addEventListener('click', triggerPicker);
  elements.promptChooseBtn.addEventListener('click', triggerPicker);

  elements.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      await processImageSource(file, file, file.name.replace(/\.[^/.]+$/, ''));
      elements.fileInput.value = '';
    }
  });

  // Drag and Drop
  const promptZone = elements.promptZone;
  ['dragenter', 'dragover'].forEach((ev) => {
    promptZone.addEventListener(ev, (e) => {
      e.preventDefault();
      promptZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    promptZone.addEventListener(ev, (e) => {
      e.preventDefault();
      promptZone.classList.remove('dragover');
    });
  });
  promptZone.addEventListener('drop', async (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      await processImageSource(file, file, file.name.replace(/\.[^/.]+$/, ''));
    }
  });

  // Sample Buttons
  document.getElementById('sample-bac-btn').addEventListener('click', async () => {
    const res = await fetch('samples/bacterial-plate.jpg');
    const blob = await res.blob();
    await processImageSource(blob, blob, 'E. coli CFU Assay (Nutrient Agar)');
  });

  document.getElementById('sample-staph-btn').addEventListener('click', async () => {
    const res = await fetch('samples/staph-blood-agar.jpg');
    const blob = await res.blob();
    state.agarType = 'blood';
    elements.selectAgar.value = 'blood';
    await processImageSource(blob, blob, 'S. aureus Assay (Blood Agar)');
  });

  document.getElementById('sample-yeast-btn').addEventListener('click', async () => {
    const res = await fetch('samples/yeast-cell-culture.jpg');
    const blob = await res.blob();
    state.agarType = 'yeast';
    elements.selectAgar.value = 'yeast';
    await processImageSource(blob, blob, 'S. cerevisiae Hemocytometer');
  });

  // View Mode Segmented Control
  const viewButtons = document.querySelectorAll('.view-segmented button');
  viewButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      viewButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeView = btn.dataset.view;
      renderMainCanvas();
    });
  });

  // Sliders
  elements.sliderSensitivity.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.params.thresholdC = val;
    elements.valSensitivity.textContent = val;
    triggerReanalysis();
  });

  elements.sliderMinRadius.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.params.minRadius = val;
    elements.valMinRadius.textContent = `${val}px`;
    triggerReanalysis();
  });

  elements.sliderMaxRadius.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.params.maxRadius = val;
    elements.valMaxRadius.textContent = `${val}px`;
    triggerReanalysis();
  });

  elements.sliderCircularity.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.params.minCircularity = val;
    elements.valCircularity.textContent = val.toFixed(2);
    triggerReanalysis();
  });

  // Dilution & Volume Dropdowns
  elements.selectDilution.addEventListener('change', (e) => {
    state.dilutionExponent = parseInt(e.target.value, 10);
    state.dilutionFactor = Math.pow(10, state.dilutionExponent);
    updateMetricsAndUI();
  });

  elements.selectVolume.addEventListener('change', (e) => {
    state.platedVolumeMl = parseFloat(e.target.value);
    updateMetricsAndUI();
  });

  elements.selectAgar.addEventListener('change', (e) => {
    state.agarType = e.target.value;
    triggerReanalysis();
  });

  // Action Buttons
  elements.btnSaveExp.addEventListener('click', saveCurrentExperiment);
  elements.btnDownloadPng.addEventListener('click', downloadAnnotatedImage);
  elements.btnExportCsv.addEventListener('click', exportColoniesCsv);
  elements.btnPrintReport.addEventListener('click', () => window.print());
  elements.btnScanAnother.addEventListener('click', () => {
    elements.workbench.hidden = true;
    elements.promptZone.hidden = false;
    state.currentImageSource = null;
    state.currentResult = null;
    elements.statusText.textContent = 'ColonyVision Wasm 4.12.0 Ready';
  });

  // Library Search
  elements.librarySearch.addEventListener('input', () => refreshLibraryUI());

  // Reset App Data
  elements.btnResetApp.addEventListener('click', () => {
    elements.resetConfirmDialog.showModal();
  });
  elements.btnCancelReset.addEventListener('click', () => {
    elements.resetConfirmDialog.close();
  });
  elements.btnConfirmReset.addEventListener('click', async () => {
    elements.resetConfirmDialog.close();
    await db.resetAllData();
    showToast('App data and IndexedDB database reset.');
    await refreshLibraryUI();
  });
}

/**
 * Application Entry Point
 */
document.addEventListener('DOMContentLoaded', async () => {
  initVisionClient();
  setupCanvasInteractions();
  setupCamera();
  setupEventListeners();
  await refreshLibraryUI();

  // Register Service Worker for offline PWA functionality
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (_) {}
  }
});
