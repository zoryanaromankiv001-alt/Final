# ColonyVision Lab: Browser-Based Bio-Colony Counter & Cellular Morphometry

[![OpenCV.js](https://img.shields.io/badge/OpenCV.js-4.12.0_Wasm-blue.svg)](https://docs.opencv.org/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-Isolated_Worker-purple.svg)](https://webassembly.org/)
[![IndexedDB](https://img.shields.io/badge/IndexedDB-colonyvision__db-green.svg)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
[![Netlify](https://img.shields.io/badge/Netlify-Ready-00c7b7.svg)](https://www.netlify.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An automated microbiology and cellular morphometry laboratory running **100% inside your browser**. 

Take a photo of a biological Petri dish (or use a live webcam) and immediately obtain accurate Colony Forming Unit (CFU) counts, concentration estimates (\(\text{CFU/mL}\)), morphological size classifications, circularity indices, and spatial clustering heatmaps.

**Zero server round-trips. Zero cloud uploads. Total data privacy.**

---

### Student & Project Attribution
- **Student / Developer:** Zoryana Pihach Romankiv (`zoryanaromankiv001-alt`)
- **Email:** `zoryana.romankiv001@mymdc.net`
- **Course:** CAI 2840 — Introduction to Computer Vision
- **Institution:** Miami Dade College
- **Instructor:** Dr. Ernesto Lee
- **Masterclass Topic:** *The Browser Is the Computer — WebAssembly • IndexedDB • OpenCV.js*
- **GitHub Repository:** [zoryanaromankiv001-alt/Final](https://github.com/zoryanaromankiv001-alt/Final)

---

## The Three Pillars: Muscle, Memory, and Eyes

Following Dr. Ernesto Lee's masterclass architecture, ColonyVision demonstrates how modern web browsers eliminate the need for server-side processing:

| Component | Role | Technology | Implementation in ColonyVision |
|---|---|---|---|
| **Muscle** | Compiled Runtime | **WebAssembly (Wasm)** | OpenCV.js compiles C++ into high-speed WebAssembly, running inside an isolated classic **Web Worker** with zero main-thread UI jank. |
| **Memory** | Structured Storage | **IndexedDB** | Transactional browser-local database (`colonyvision_db`) storing high-resolution image Blobs, segmentation masks, colony metric arrays, and notes that survive page reloads and browser restarts. |
| **Eyes** | Vision Operations | **OpenCV.js** | Multi-stage computer vision pipeline: circular Petri dish ROI masking, multi-color space conversion (RGB/HSV/LAB), Gaussian filtering, Adaptive Gaussian Thresholding, morphological opening, distance transform peak separation, and contour moment morphometry. |
| **Control** | Events & Logic | **JavaScript ES Modules** | Apple HIG interface, interactive canvas tooltips, human-in-the-loop colony editing, dilution calculations, and CSV/PDF export. |

---

## Computer Vision Pipeline

```
Raw Camera / File Photo
          │
          ▼
Downscaled Edge Detection & Circular Hough / Contour Analysis
          │ (Auto-detects 90mm Petri dish & creates rim exclusion mask)
          ▼
Color Space Transformation (Grayscale + HSV Value Channel Extraction)
          │
          ▼
Gaussian Smoothing (5×5 Kernel) & Noise Suppression
          │
          ▼
Adaptive Gaussian Thresholding (Compensates for non-uniform plate lighting)
          │
          ▼
Circular ROI Rim Masking (Zeros out reflection artifacts outside agar)
          │
          ▼
Morphological Opening (Elliptical 3×3 Structuring Element removes dust)
          │
          ▼
Euclidean Distance Transform & Peak Separation (Resolves touching colonies)
          │
          ▼
Contour Vectorization & Feature Morphometry:
  • Area (A) via Green's Theorem
  • Perimeter (P) via Arc Length
  • Circularity Metric: C = 4π·A / P²
  • Centroid Coordinates via Spatial Moments
  • Biological Classification: Punctiform, Small, Medium, Large
          │
          ▼
IndexedDB Storage & Interactive Visualization:
  • Interactive Canvas (Hover to inspect, Click to add/remove)
  • Density Heatmap View
  • Binary Mask Inspection
  • CFU/mL Serial Dilution Calculator
  • Full CSV & Lab Report Print Export
```

### Critical Memory Safety Guarantee
As required by Slide 7 (*"Finish the experiment; free the memory"*), every intermediate `cv.Mat` and `cv.MatVector` allocated in WebAssembly linear memory is tracked and systematically deleted inside a `try ... finally` block via `T.free()`. This ensures **0 memory leaks** even when processing dozens of consecutive 4K plates.

---

## Key Features

1. **Interactive Colony Inspector & Human-in-the-Loop Validation:**
   - Hover over any colony on the stage to view its real-time biological profile (Colony ID, Centroid \((X, Y)\), Area in \(px^2\), Radius in \(px\), Circularity score \(0.0 - 1.0\), and Size Class).
   - Click on an existing colony to remove false positives (e.g. agar bubbles).
   - Click on empty agar space to add missed colonies.
2. **Serial Dilution & Microbiological Concentration:**
   - Built-in dilution factor selector (\(10^0\) to \(10^{-7}\)) and plating volume calculator (\(0.05\text{ mL}\) to \(1.0\text{ mL}\)) computing true viable cell concentration in \(\text{CFU/mL}\).
3. **Multi-View Inspection:**
   - **Annotated Overlay:** Color-coded detection circles categorized by size (Green = Punctiform, Blue = Small, Orange = Medium, Purple = Large).
   - **Density Heatmap:** Kernel density surface visualizing colony clustering and lawn formation.
   - **Binary Segmentation Mask:** Direct visualization of the OpenCV adaptive threshold and morphological opening.
   - **Raw Photo:** Clean original unannotated view.
4. **Hardware-Accelerated Real-Time Benchmarking:**
   - Real-time pipeline latency display measuring Wasm execution in milliseconds.
5. **Persistent Lab Notebook (IndexedDB):**
   - Automatically saves completed assays with thumbnail previews, sample names, timestamps, dilution factors, and colony counts.
   - Search and filter assays by name or date.
   - "Reset App Data" option to purge local storage safely.
6. **Academic & Research Export Options:**
   - High-Resolution Annotated PNG download.
   - Full CSV export containing row-by-row morphological metrics for every detected colony.
   - Formatted printable laboratory experiment report (`window.print()`).
7. **Built-in Masterclass Specimens:**
   - *E. coli* CFU Assay (Nutrient Agar).
   - *S. aureus* Beta-Hemolysis (Blood Agar).
   - *S. cerevisiae* Yeast Hemocytometer Culture.
8. **Progressive Web App (PWA) Offline Support:**
   - Includes `sw.js` (Service Worker) and `manifest.json`. Cache-first strategy allows full offline execution once opened.

---

## Deploy to Netlify

This repository is configured as a zero-build static site ready for immediate Netlify deployment.

### Method 1: Direct from Git (Recommended)
1. Go to [Netlify](https://app.netlify.com/).
2. Click **Add new site → Import an existing project**.
3. Select this GitHub repository: `zoryanaromankiv001-alt/Final`.
4. Leave **Build command** empty.
5. Ensure **Publish directory** is set to `.` (Netlify automatically detects this from `netlify.toml`).
6. Click **Deploy Site**. Your site will be live with full HTTPS and camera access.

### Method 2: Drag and Drop
1. Open [https://app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag and drop this project folder directly onto the page.

---

## Run Locally

Because modern web browsers restrict Web Workers and ES modules under `file://` protocols, run a lightweight local server:

```bash
# Using Python
python tools/serve-netlify.py 8080
# Open http://localhost:8080 in your browser
```

Or using standard Python HTTP server:
```bash
python -m http.server 8080
```

---

## Repository Structure

```
├── index.html              # Main application stage & interactive workbench
├── how-it-works.html       # Plain-language and mathematical CV explainer
├── resources.html          # Academic references, microbiology standards & links
├── guide/
│   └── index.html          # Technical architecture & engineering specification
├── css/
│   └── styles.css          # Apple HIG & Liquid Glass visual design system
├── js/
│   ├── app.js              # Main-thread controller, camera, canvas inspector, export
│   ├── db.js               # Structured IndexedDB database wrapper
│   ├── pipeline.js         # Pure OpenCV.js image processing pipeline
│   └── vision-client.js    # Web Worker supervisor with timeout and crash recovery
├── vision.worker.js        # Dedicated Web Worker executing WebAssembly off-thread
├── vendor/
│   └── opencv/
│       └── 4.12.0/
│           ├── LICENSE     # Apache 2.0 / 3-clause BSD OpenCV license
│           └── opencv.js   # Official single-file Emscripten WebAssembly build
├── samples/
│   ├── bacterial-plate.jpg # E. coli Nutrient Agar synthetic sample
│   ├── staph-blood-agar.jpg# S. aureus Blood Agar synthetic sample
│   ├── yeast-cell-culture.jpg # S. cerevisiae Hemocytometer sample
│   └── ground-truth.json   # Known colony coordinates and counts for verification
├── tests/
│   └── test-pipeline.py    # Automated test suite
├── tools/
│   ├── make-samples.py     # High-resolution synthetic microbiology generator
│   └── serve-netlify.py    # Local server simulating Netlify security headers
├── netlify.toml            # Netlify deployment configuration & cache headers
├── _headers                # Fallback static HTTP headers
├── manifest.json           # Web App Manifest
├── sw.js                   # Service Worker for offline PWA caching
├── LICENSE                 # MIT License
└── README.md               # Project documentation
```

---

## License

MIT License. Developed by **Zoryana Pihach Romankiv** for CAI 2840 (Miami Dade College).
OpenCV is distributed under its respective Apache 2.0 / 3-clause BSD license.
