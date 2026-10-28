importScripts("./core.js");
const C = self.SortLabCore;
let cancelled = false;
function shuffle(a, seed) {
  const r = C.rng(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function measure(name, base, reference, repeats, limitMs) {
  const startAll = performance.now();
  const deadline = startAll + limitMs;
  try {
    // Warm-up uses the same implementation and lies outside reported samples.
    const warm = base.slice();
    C.sort(name, warm, null, deadline);
    if (!C.equal(warm, reference)) throw Error("Ошибка проверки результата на прогреве");
    const pilot = base.slice(), p0 = performance.now();
    C.sort(name, pilot, null, deadline);
    const pilotMs = performance.now() - p0;
    if (!C.equal(pilot, reference)) throw Error("Ошибка проверки результата");
    const batchSize = Math.max(1, Math.min(40, Math.floor(150000 / Math.max(1, base.length)), Math.ceil(4 / Math.max(0.04, pilotMs))));
    const samples = [];
    for (let r = 0; r < repeats; r++) {
      if (performance.now() > deadline) { const e = Error("Превышен лимит времени"); e.code = "timeout"; throw e; }
      const batch = Array.from({ length: batchSize }, () => base.slice());
      const t0 = performance.now();
      for (const a of batch) C.sort(name, a, null, deadline);
      const elapsed = performance.now() - t0;
      for (const a of batch) if (!C.equal(a, reference)) throw Error("Ошибка проверки результата");
      samples.push(elapsed / batchSize);
    }
    const counted = base.slice();
    const metrics = C.sort(name, counted, () => {}, deadline);
    if (!C.equal(counted, reference)) throw Error("Ошибка проверки операций");
    const summary = C.stats(samples);
    if (summary.median === 0) return { status: "imprecise", error: "Недостаточная точность таймера для этого запуска", samples, metrics, batchSize };
    return { status: "ok", samples, ...summary, metrics, batchSize, lowPrecision: summary.median * batchSize < 1 };
  } catch (error) {
    return { status: error.code === "timeout" ? "timeout" : "error", error: String(error.message || error), samples: [] };
  }
}
self.onmessage = event => {
  const { type, config } = event.data || {};
  if (type === "cancel") { cancelled = true; return; }
  if (type !== "run") return;
  cancelled = false;
  const { algorithms, sizes, cases, repeats, seed, min, max, nearlySwaps, distinct, custom, limitMs } = config;
  const groups = sizes.flatMap(n => cases.map(kind => ({ n, kind }))).filter(x => x.kind !== "custom" || x.n === C.parseNumbers(custom).length);
  const total = groups.length * algorithms.length;
  const results = [];
  let done = 0;
  for (const { n, kind } of groups) {
    let base, reference;
    try {
      base = C.generate(kind, n, seed, { min, max, nearlySwaps, distinct, custom });
      reference = C.expected(base);
    } catch (error) {
      for (const name of algorithms) results.push({ name, n, kind, status: "error", error: error.message, samples: [] });
      done += algorithms.length;
      self.postMessage({ type: "progress", done, total, results: results.slice() });
      continue;
    }
    const order = shuffle(algorithms.slice(), C.hashSeed(seed, n, kind, "order"));
    for (const name of order) {
      if (cancelled) { self.postMessage({ type: "cancelled", results }); return; }
      const measurement = measure(name, base, reference, repeats, limitMs);
      results.push({ name, n, kind, ...measurement });
      done++;
      self.postMessage({ type: "progress", done, total, results: results.slice() });
    }
  }
  self.postMessage({ type: "done", results });
};
