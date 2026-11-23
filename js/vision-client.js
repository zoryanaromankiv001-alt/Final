/**
 * ColonyVision Lab: Main-thread Worker Client
 * Author: Zoryana Pihach Romankiv (CAI 2840 - Introduction to Computer Vision)
 *
 * Coordinates asynchronous communication with vision.worker.js.
 * Encapsulates timeouts, worker crashes, message transfer lists, and worker recovery.
 */

export function createVisionClient({
  workerUrl = 'vision.worker.js',
  loadTimeout = 45000,
  jobTimeout = 30000
} = {}) {
  let worker = null;
  let readyPromise = null;
  let nextId = 1;
  let currentStatus = 'loading';
  const pendingRequests = new Map(); // id -> { resolve, reject, timer, onProgress }
  const statusListeners = new Set();

  function setStatus(status, detail) {
    currentStatus = status;
    for (const listener of statusListeners) {
      try { listener(status, detail); } catch (_) {}
    }
  }

  function rejectAll(message) {
    for (const p of pendingRequests.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
    }
    pendingRequests.clear();
  }

  function start() {
    setStatus('loading');
    worker = new Worker(workerUrl);

    let settleReady;
    readyPromise = new Promise((resolve, reject) => {
      const loadTimer = setTimeout(() => {
        reject(new Error('OpenCV.js WebAssembly runtime timed out while compiling.'));
      }, loadTimeout);

      settleReady = {
        resolve: (v) => { clearTimeout(loadTimer); resolve(v); },
        reject: (e) => { clearTimeout(loadTimer); reject(e); }
      };
    });

    readyPromise
      .then((v) => setStatus('ready', v))
      .catch((e) => setStatus('failed', e));

    worker.onmessage = (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === 'ready') {
        settleReady.resolve({ version: msg.version, buildInfo: msg.buildInfo });
        return;
      }

      if (msg.type === 'fatal') {
        settleReady.reject(new Error(msg.message));
        setStatus('failed', new Error(msg.message));
        return;
      }

      const id = msg.id;
      const req = pendingRequests.get(id);
      if (!req) return;

      if (msg.type === 'progress') {
        if (typeof req.onProgress === 'function') {
          req.onProgress(msg.stage);
        }
        return;
      }

      clearTimeout(req.timer);
      pendingRequests.delete(id);

      if (msg.type === 'result') {
        req.resolve(msg);
      } else if (msg.type === 'error') {
        req.reject(new Error(msg.message || 'Worker processing error'));
      } else if (msg.type === 'stats') {
        req.resolve(msg);
      }
    };

    worker.onerror = (err) => {
      const errorMsg = (err && err.message) || 'Web Worker script error.';
      setStatus('failed', new Error(errorMsg));
      rejectAll(`Worker crashed: ${errorMsg}`);
    };
  }

  start();

  return {
    onStatus(cb) {
      statusListeners.add(cb);
      cb(currentStatus);
      return () => statusListeners.delete(cb);
    },

    get status() {
      return currentStatus;
    },

    ready() {
      return readyPromise;
    },

    analyze(bitmap, options = {}, onProgress = null) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pendingRequests.delete(id);
          reject(new Error(`Vision pipeline job #${id} timed out after ${jobTimeout / 1000}s.`));
        }, jobTimeout);

        pendingRequests.set(id, { resolve, reject, timer, onProgress });

        try {
          // Zero-copy transfer of ImageBitmap into the worker
          worker.postMessage(
            {
              type: 'analyze',
              id,
              bitmap,
              options
            },
            [bitmap]
          );
        } catch (err) {
          clearTimeout(timer);
          pendingRequests.delete(id);
          reject(err);
        }
      });
    },

    stats() {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pendingRequests.delete(id);
          reject(new Error('Stats request timed out'));
        }, 5000);

        pendingRequests.set(id, { resolve, reject, timer });
        worker.postMessage({ type: 'stats', id });
      });
    },

    restart() {
      setStatus('restarting');
      if (worker) {
        try { worker.terminate(); } catch (_) {}
        worker = null;
      }
      rejectAll('Worker was restarted by user.');
      start();
      return readyPromise;
    }
  };
}
