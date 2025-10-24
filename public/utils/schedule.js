export const raf = (fn) => requestAnimationFrame(fn);
export const micro = (fn) => Promise.resolve().then(fn);

// Lặp cho đến khi hết data() hoặc quá ngân sách ms/frame
export function timeSlice(runStep, { budget = 8 } = {}) {
  return new Promise((resolve) => {
    function tick() {
      const start = performance.now();
      let keep = true;
      do { keep = runStep(); }
      while (keep && performance.now() - start < budget);
      if (keep) raf(tick); else resolve();
    }
    raf(tick);
  });
}
