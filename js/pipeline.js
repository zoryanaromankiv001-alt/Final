/**
 * ColonyVision Lab: Core Computer Vision Pipeline
 * Author: Zoryana Pihach Romankiv (CAI 2840 - Introduction to Computer Vision)
 *
 * Runs inside the Web Worker (classic worker) or in tests.
 * Pure OpenCV.js image processing functions.
 *
 * Memory Safety:
 * Every cv.Mat and cv.MatVector allocated here is tracked and deleted in try/finally blocks.
 * Zero memory leaks in the WebAssembly heap.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ColonyPipeline = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Helper: Tracks every allocated Mat so one call to T.free() deletes all of them safely.
   */
  function tracker() {
    const mats = [];
    const T = (m) => {
      if (m) mats.push(m);
      return m;
    };
    T.free = () => {
      for (const m of mats) {
        if (m && typeof m.delete === 'function' && !m.isDeleted()) {
          try { m.delete(); } catch (_) {}
        }
      }
      mats.length = 0;
    };
    return T;
  }

  /**
   * Automatically detect the circular Petri dish boundary if present.
   * Uses downscaled edge detection + largest circular contour / enclosing circle.
   */
  function detectDish(cv, srcMat, T) {
    const w = srcMat.cols;
    const h = srcMat.rows;
    const minDim = Math.min(w, h);

    // Default dish assumption: centered circle occupying ~86% of the frame
    const defaultDish = {
      detected: false,
      cx: Math.round(w / 2),
      cy: Math.round(h / 2),
      r: Math.round(minDim * 0.43)
    };

    try {
      // Downscale for fast dish outline detection
      const scale = 400 / Math.max(w, h);
      const smallW = Math.round(w * scale);
      const smallH = Math.round(h * scale);
      const small = T(new cv.Mat());
      cv.resize(srcMat, small, new cv.Size(smallW, smallH), 0, 0, cv.INTER_LINEAR);

      const gray = T(new cv.Mat());
      cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);

      const blur = T(new cv.Mat());
      cv.GaussianBlur(gray, blur, new cv.Size(9, 9), 2, 2);

      // Canny edge detection for dish rim
      const edges = T(new cv.Mat());
      cv.Canny(blur, edges, 30, 90);

      const contours = T(new cv.MatVector());
      const hierarchy = T(new cv.Mat());
      cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      let bestCircle = null;
      let maxArea = (smallW * smallH) * 0.15; // Must be at least 15% of image area

      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const area = cv.contourArea(c);
        if (area > maxArea && area < (smallW * smallH) * 0.95) {
          const circle = cv.minEnclosingCircle(c);
          const circleArea = Math.PI * circle.radius * circle.radius;
          const circularity = area / circleArea;
          if (circularity > 0.65 && circle.radius > smallW * 0.28) {
            maxArea = area;
            bestCircle = {
              detected: true,
              cx: Math.round(circle.center.x / scale),
              cy: Math.round(circle.center.y / scale),
              r: Math.round(circle.radius / scale)
            };
          }
        }
        c.delete();
      }

      return bestCircle || defaultDish;
    } catch (_) {
      return defaultDish;
    }
  }

  /**
   * Main colony analysis pipeline.
   *
   * @param {Object} cv - OpenCV.js instance
   * @param {cv.Mat} srcMat - Input 8-bit RGBA Mat
   * @param {Object} options - Configuration parameters
   * @returns {Object} Analysis results, metrics, and mask
   */
  function analyze(cv, srcMat, options = {}) {
    const t0 = performance.now();
    const T = tracker();

    const w = srcMat.cols;
    const h = srcMat.rows;

    const opts = {
      agarType: options.agarType || 'auto', // 'nutrient' | 'blood' | 'yeast' | 'auto'
      blurSize: (options.blurSize && options.blurSize % 2 === 1) ? options.blurSize : 5,
      thresholdMode: options.thresholdMode || 'adaptive', // 'adaptive' | 'otsu'
      blockSize: (options.blockSize && options.blockSize % 2 === 1) ? options.blockSize : 25,
      thresholdC: options.thresholdC !== undefined ? options.thresholdC : 8,
      minRadius: options.minRadius !== undefined ? options.minRadius : 3.0,
      maxRadius: options.maxRadius !== undefined ? options.maxRadius : 80.0,
      minCircularity: options.minCircularity !== undefined ? options.minCircularity : 0.40,
      dishMode: options.dishMode || 'auto', // 'auto' | 'custom' | 'none'
      customDish: options.customDish || null,
      separateTouching: options.separateTouching !== false
    };

    try {
      // 1. Petri Dish ROI detection
      let dish = null;
      if (opts.dishMode === 'none') {
        dish = { detected: false, cx: w / 2, cy: h / 2, r: Math.max(w, h) };
      } else if (opts.dishMode === 'custom' && opts.customDish) {
        dish = { detected: true, ...opts.customDish };
      } else {
        dish = detectDish(cv, srcMat, T);
      }

      const tPrep0 = performance.now();

      // 2. Grayscale & Color Space Conversion
      const gray = T(new cv.Mat());
      const hsv = T(new cv.Mat());
      cv.cvtColor(srcMat, hsv, cv.COLOR_RGBA2RGB);
      cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
      cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

      // Automatic agar detection if set to 'auto'
      let effectiveAgar = opts.agarType;
      if (effectiveAgar === 'auto') {
        // Sample center agar color
        const cx = Math.round(dish.cx);
        const cy = Math.round(dish.cy);
        const pixel = srcMat.ucharPtr(Math.min(h - 1, Math.max(0, cy)), Math.min(w - 1, Math.max(0, cx)));
        const r = pixel[0], g = pixel[1], b = pixel[2];

        if (r > 100 && g < 70 && b < 70) {
          effectiveAgar = 'blood'; // Red agar
        } else if (r > 190 && g > 190 && b > 190 && Math.abs(r - b) < 25) {
          effectiveAgar = 'yeast'; // Brightfield / hemocytometer gray
        } else {
          effectiveAgar = 'nutrient'; // Default cream/amber agar
        }
      }

      // Preprocessing target Mat based on agar
      const targetMat = T(new cv.Mat());
      if (effectiveAgar === 'blood') {
        // For blood agar with golden colonies, Value channel or Green inversion offers highest contrast
        const hsvChannels = T(new cv.MatVector());
        cv.split(hsv, hsvChannels);
        const vChan = hsvChannels.get(2);
        vChan.copyTo(targetMat);
        for (let i = 0; i < hsvChannels.size(); i++) hsvChannels.get(i).delete();
      } else if (effectiveAgar === 'yeast') {
        // Brightfield yeast: dark cell walls, bright centers
        gray.copyTo(targetMat);
      } else {
        // Nutrient agar
        gray.copyTo(targetMat);
      }

      // 3. Noise reduction with Gaussian blur
      const blur = T(new cv.Mat());
      cv.GaussianBlur(targetMat, blur, new cv.Size(opts.blurSize, opts.blurSize), 0, 0, cv.BORDER_DEFAULT);

      const tPrep1 = performance.now();

      // 4. Segmentation / Thresholding
      const binary = T(new cv.Mat());
      if (opts.thresholdMode === 'otsu') {
        cv.threshold(blur, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      } else {
        // Adaptive Gaussian thresholding
        const invert = (effectiveAgar === 'yeast');
        const threshType = invert ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY;
        const C = invert ? -opts.thresholdC : -opts.thresholdC;
        cv.adaptiveThreshold(blur, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, threshType, opts.blockSize, C);
      }

      // 5. Mask out area outside Petri dish rim (prevent plastic reflection artifacts)
      if (opts.dishMode !== 'none' && dish.r < Math.max(w, h)) {
        const dishMask = T(new cv.Mat.zeros(h, w, cv.CV_8UC1));
        const center = new cv.Point(Math.round(dish.cx), Math.round(dish.cy));
        const safeR = Math.max(10, Math.round(dish.r - 8)); // 8px inner margin
        cv.circle(dishMask, center, safeR, new cv.Scalar(255), -1, cv.LINE_8, 0);
        cv.bitwise_and(binary, dishMask, binary);
      }

      // 6. Morphological Opening (removes single-pixel dust/camera sensor noise)
      const morphKernel = T(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3)));
      const cleaned = T(new cv.Mat());
      cv.morphologyEx(binary, cleaned, cv.MORPH_OPEN, morphKernel);

      // 7. Distance Transform & Peak Separation for Touching Colonies
      let workingBin = cleaned;
      if (opts.separateTouching) {
        try {
          const dist = T(new cv.Mat());
          cv.distanceTransform(cleaned, dist, cv.DIST_L2, 5);
          const minMax = cv.minMaxLoc(dist);
          if (minMax.maxVal > 3.0) {
            const peaks = T(new cv.Mat());
            cv.threshold(dist, peaks, minMax.maxVal * 0.32, 255, cv.THRESH_BINARY);
            const peaks8u = T(new cv.Mat());
            peaks.convertTo(peaks8u, cv.CV_8UC1);
            // Combine smoothed peaks
            workingBin = peaks8u;
          }
        } catch (_) {
          workingBin = cleaned;
        }
      }

      const tSeg1 = performance.now();

      // 8. Contour extraction & Morphometry
      const contours = T(new cv.MatVector());
      const hierarchy = T(new cv.Mat());
      cv.findContours(workingBin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const colonies = [];
      const countsByCategory = { punctiform: 0, small: 0, medium: 0, large: 0 };
      let totalArea = 0;
      let totalCircularity = 0;

      const numContours = contours.size();
      for (let i = 0; i < numContours; i++) {
        const c = contours.get(i);
        const area = cv.contourArea(c);
        const peri = cv.arcLength(c, true);

        if (peri <= 0 || area <= 0) {
          c.delete();
          continue;
        }

        // Circularity: 4 * pi * area / (perimeter^2)
        const circularity = Math.min(1.0, (4 * Math.PI * area) / (peri * peri));
        const circle = cv.minEnclosingCircle(c);
        const r = circle.radius;
        const cx = circle.center.x;
        const cy = circle.center.y;

        // Centroid from moments for higher geometric accuracy
        const M = cv.moments(c);
        const centroidX = M.m00 !== 0 ? Math.round((M.m10 / M.m00) * 10) / 10 : Math.round(cx * 10) / 10;
        const centroidY = M.m00 !== 0 ? Math.round((M.m01 / M.m00) * 10) / 10 : Math.round(cy * 10) / 10;

        // Dish rim check: distance from dish center
        if (opts.dishMode !== 'none') {
          const distFromCenter = Math.hypot(centroidX - dish.cx, centroidY - dish.cy);
          if (distFromCenter > (dish.r - 10)) {
            c.delete();
            continue;
          }
        }

        // Filter by radius and circularity
        if (r < opts.minRadius || r > opts.maxRadius || circularity < opts.minCircularity) {
          c.delete();
          continue;
        }

        // Size classification (biologically grounded standard):
        // Punctiform: tiny pinpoint (< 0.5 mm equivalent or < 35 px^2)
        // Small: 0.5 - 1.5 mm (35 - 120 px^2)
        // Medium: 1.5 - 3.0 mm (120 - 350 px^2)
        // Large: > 3.0 mm (>= 350 px^2)
        let category = 'punctiform';
        if (area >= 350) category = 'large';
        else if (area >= 120) category = 'medium';
        else if (area >= 35) category = 'small';

        countsByCategory[category]++;
        totalArea += area;
        totalCircularity += circularity;

        colonies.push({
          id: colonies.length + 1,
          x: centroidX,
          y: centroidY,
          r: Math.round(r * 10) / 10,
          area: Math.round(area * 10) / 10,
          perimeter: Math.round(peri * 10) / 10,
          circularity: Math.round(circularity * 100) / 100,
          category
        });

        c.delete();
      }

      const tContour1 = performance.now();

      // 9. Mask extraction for interactive UI visualization
      // Convert 1-channel binary mask to 4-channel RGBA for canvas rendering
      const maskRgba = T(new cv.Mat());
      cv.cvtColor(cleaned, maskRgba, cv.COLOR_GRAY2RGBA);
      const maskData = new Uint8ClampedArray(maskRgba.data);

      const count = colonies.length;
      const meanArea = count > 0 ? Math.round((totalArea / count) * 10) / 10 : 0;
      const meanCircularity = count > 0 ? Math.round((totalCircularity / count) * 100) / 100 : 0;

      // Colony density: colonies per cm^2 on standard 90mm (63.6 cm^2) petri dish
      const dishAreaCm2 = (opts.dishMode !== 'none' && dish.r) ? 63.6 : (w * h) / 10000;
      const density = Math.round((count / dishAreaCm2) * 10) / 10;

      return {
        ok: true,
        count,
        colonies,
        dish,
        agarType: effectiveAgar,
        categories: countsByCategory,
        stats: {
          meanArea,
          meanCircularity,
          density,
          dishAreaCm2
        },
        maskWidth: w,
        maskHeight: h,
        maskData,
        timing: {
          prepMs: Math.round(tPrep1 - tPrep0),
          segMs: Math.round(tSeg1 - tPrep1),
          contourMs: Math.round(tContour1 - tSeg1),
          totalMs: Math.round(tContour1 - t0)
        }
      };
    } finally {
      // Critical CAI 2840 memory rule: All intermediate Mats are safely deleted
      T.free();
    }
  }

  return {
    tracker,
    detectDish,
    analyze
  };
});
