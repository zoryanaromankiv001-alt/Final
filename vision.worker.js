/**
 * ColonyVision Lab: Dedicated Web Worker
 * Author: Zoryana Pihach Romankiv (CAI 2840 - Introduction to Computer Vision)
 *
 * Runs OpenCV.js (WebAssembly) off the main UI thread.
 * Zero main-thread UI blocking, smooth 60fps animations.
 *
 * Protocol:
 *   worker -> main:  { type: 'ready', version }
 *                    { type: 'fatal', message }
 *                    { type: 'progress', id, stage }
 *                    { type: 'result', id, ... }
 *                    { type: 'error', id, message }
 *   main -> worker:  { type: 'analyze', id, bitmap, options } (transfer [bitmap])
 *                    { type: 'stats', id }
 */
'use strict';

const OPENCV_URL = 'vendor/opencv/4.12.0/opencv.js';
const MAX_SOURCE_SIDE = 3200; // Cap oversized phone images to safeguard Wasm heap

let loadError = null;
try {
  self.importScripts(OPENCV_URL, 'js/pipeline.js');
} catch (e) {
  loadError = e;
}

/**
 * Resolve OpenCV runtime.
 * Handles OpenCV 4.12.0 Emscripten 'thenable' promise resolution safely.
 */
const cvReady = (async () => {
  if (loadError) throw loadError;
  let c = self.cv;
  if (!c) throw new Error('opencv.js loaded but did not define cv in worker scope.');

  const unthen = (m) => {
    if (m && typeof m.then === 'function') {
      try { delete m.then; } catch (_) {}
      if (typeof m.then === 'function') m.then = undefined;
    }
    return m;
  };

  if (c instanceof Promise) {
    c = await c.then((m) => ({ m: unthen(m) })).then((box) => box.m);
  } else if (typeof c.then === 'function') {
    c = await new Promise((resolve) => {
      const origThen = c.then.bind(c);
      unthen(c);
      origThen((m) => resolve(unthen(m)));
    });
  }

  if (!c.Mat) {
    await new Promise((resolve) => {
      const prev = c.onRuntimeInitialized;
      c.onRuntimeInitialized = () => {
        if (typeof prev === 'function') prev();
        resolve();
      };
    });
  }

  unthen(c);
  self.cv = c;
  return c;
})();

cvReady
  .then((c) => {
    self.postMessage({
      type: 'ready',
      version: '4.12.0',
      buildInfo: c.getBuildInformation ? 'OpenCV.js 4.12.0 Wasm' : 'Wasm Ready'
    });
  })
  .catch((err) => {
    self.postMessage({
      type: 'fatal',
      message: (err && err.message) || String(err)
    });
  });

/**
 * Handle incoming requests from main thread
 */
self.onmessage = async (e) => {
  const data = e.data;
  if (!data || !data.type) return;

  if (data.type === 'stats') {
    try {
      const cv = await cvReady;
      const heapBytes = (cv && cv.HEAPU8) ? cv.HEAPU8.byteLength : 0;
      self.postMessage({ type: 'stats', id: data.id, heapBytes });
    } catch (err) {
      self.postMessage({ type: 'stats', id: data.id, error: String(err) });
    }
    return;
  }

  if (data.type === 'analyze') {
    const { id, bitmap, options } = data;
    let srcMat = null;

    try {
      const cv = await cvReady;
      self.postMessage({ type: 'progress', id, stage: 'Decoding image buffer' });

      // Determine dimensions
      let w = bitmap.width;
      let h = bitmap.height;
      if (Math.max(w, h) > MAX_SOURCE_SIDE) {
        const s = MAX_SOURCE_SIDE / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }

      // Draw transferred ImageBitmap onto an OffscreenCanvas to extract RGBA ImageData
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close(); // Release transferred bitmap memory immediately

      const imgData = ctx.getImageData(0, 0, w, h);
      srcMat = cv.matFromImageData(imgData);

      self.postMessage({ type: 'progress', id, stage: 'Running OpenCV WebAssembly pipeline' });

      // Execute pipeline
      const result = self.ColonyPipeline.analyze(cv, srcMat, options);

      // Transfer mask buffer back to main thread zero-copy
      const maskBuffer = result.maskData ? result.maskData.buffer : null;
      const transferList = maskBuffer ? [maskBuffer] : [];

      self.postMessage(
        {
          type: 'result',
          id,
          ...result
        },
        transferList
      );
    } catch (err) {
      self.postMessage({
        type: 'error',
        id,
        message: (err && err.message) || String(err)
      });
    } finally {
      if (srcMat && !srcMat.isDeleted()) {
        try { srcMat.delete(); } catch (_) {}
      }
    }
  }
};
