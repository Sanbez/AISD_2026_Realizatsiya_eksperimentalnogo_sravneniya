(function (root) {
  "use strict";
  const VERSION = "1.0.0";
  const GENERATOR_VERSION = "1";
  const LABELS = {
    bubble: "Пузырьковая", selection: "Выбором", insertion: "Вставками",
    quick: "Быстрая", merge: "Слиянием", heap: "Пирамидальная"
  };
  const CASES = {
    random: "Случайный", sorted: "Отсортированный", reverse: "Обратный",
    nearly: "Почти отсортированный", duplicates: "С повторениями", custom: "Свой массив"
  };
  const PSEUDO = {
    bubble: ["для каждого прохода", "сравнить соседей", "если порядок нарушен — обменять", "если обменов нет — закончить"],
    selection: ["для позиции i", "найти минимум справа", "сравнить кандидатов", "поставить минимум на позицию i"],
    insertion: ["взять очередной элемент", "сравнить с элементами слева", "сдвинуть большие значения", "записать элемент на место"],
    quick: ["выбрать опорный: медиана трёх", "сравнить с опорным", "разделить на <, = и >", "продолжить для крайних частей"],
    merge: ["разделить диапазон пополам", "сравнить головы частей", "записать в буфер", "перенести отсортированное в массив"],
    heap: ["построить максимальную кучу", "сравнить родителя с детьми", "обменять с большим ребёнком", "перенести максимум в конец"]
  };

  function hashSeed(seed, n, kind, extra) {
    let h = (Number(seed) >>> 0) ^ (n * 2654435761);
    for (const c of String(kind) + ":" + String(extra || "")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  function rng(seed) {
    let x = seed >>> 0;
    return () => {
      x += 0x6D2B79F5;
      let t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function generate(kind, n, seed, options = {}) {
    if (kind === "custom") return parseNumbers(options.custom || "");
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw Error("Недопустимый размер массива");
    const min = Number.isFinite(+options.min) ? Math.trunc(+options.min) : -999;
    const max = Number.isFinite(+options.max) ? Math.trunc(+options.max) : 999;
    if (min > max) throw Error("Минимум больше максимума");
    const random = rng(hashSeed(seed, n, kind, min + ":" + max));
    let a = Array.from({ length: n }, () => min + Math.floor(random() * (max - min + 1)));
    if (kind === "sorted" || kind === "reverse" || kind === "nearly") {
      a.sort((x, y) => x - y);
      if (kind === "reverse") a.reverse();
      if (kind === "nearly") {
        const count = Math.max(1, Math.min(n, Math.trunc(+options.nearlySwaps || Math.ceil(n * 0.03))));
        for (let k = 0; k < count; k++) {
          const i = Math.floor(random() * n), j = Math.floor(random() * n);
          [a[i], a[j]] = [a[j], a[i]];
        }
      }
    } else if (kind === "duplicates") {
      const distinct = Math.max(1, Math.min(n || 1, max - min + 1, Math.trunc(+options.distinct || 5)));
      a = Array.from({ length: n }, () => min + Math.floor(random() * distinct));
    } else if (kind !== "random") throw Error("Неизвестный тип массива");
    return a;
  }
  function parseNumbers(s) {
    const parts = String(s).trim().split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return [];
    if (parts.length > 100000) throw Error("Слишком большой пользовательский массив");
    const values = parts.map(Number);
    if (values.some(x => !Number.isFinite(x))) throw Error("Массив должен содержать только числа");
    return values;
  }
  function createContext(a, reporter, deadline) {
    let ticks = 0;
    const metrics = { comparisons: 0, swaps: 0, writes: 0 };
    function guard() {
      if (deadline && (++ticks & 2047) === 0 && performance.now() > deadline) {
        const e = Error("Превышен лимит времени"); e.code = "timeout"; throw e;
      }
    }
    return {
      metrics,
      cmp(x, y, i, j, line) {
        guard();
        if (reporter) {
          metrics.comparisons++;
          reporter({ type: "compare", i, j, line, x, y });
        }
        return x < y ? -1 : x > y ? 1 : 0;
      },
      swap(i, j, line) {
        guard();
        if (i === j) return;
        [a[i], a[j]] = [a[j], a[i]];
        if (reporter) {
          metrics.swaps++; metrics.writes += 2;
          reporter({ type: "swap", i, j, line });
        }
      },
      write(i, value, line) {
        guard();
        a[i] = value;
        if (reporter) {
          metrics.writes++;
          reporter({ type: "write", i, value, line });
        }
      },
      auxWrite(value, i, line) {
        guard();
        if (reporter) {
          metrics.writes++;
          reporter({ type: "aux", i, value, line });
        }
      },
      pivot(i, value) { if (reporter) reporter({ type: "pivot", i, value, line: 0 }); }
    };
  }
  function bubble(a, c) {
    for (let end = a.length - 1; end > 0; end--) {
      let moved = false;
      for (let i = 0; i < end; i++) if (c.cmp(a[i], a[i + 1], i, i + 1, 1) > 0) {
        c.swap(i, i + 1, 2); moved = true;
      }
      if (!moved) break;
    }
  }
  function selection(a, c) {
    for (let i = 0; i < a.length - 1; i++) {
      let min = i;
      for (let j = i + 1; j < a.length; j++) if (c.cmp(a[j], a[min], j, min, 2) < 0) min = j;
      c.swap(i, min, 3);
    }
  }
  function insertion(a, c) {
    for (let i = 1; i < a.length; i++) {
      const value = a[i]; let j = i - 1;
      while (j >= 0 && c.cmp(a[j], value, j, i, 1) > 0) {
        c.write(j + 1, a[j], 2); j--;
      }
      c.write(j + 1, value, 3);
    }
  }
  function medianIndex(a, lo, hi, c) {
    const mid = lo + ((hi - lo) >> 1);
    if (c.cmp(a[lo], a[mid], lo, mid, 0) > 0) c.swap(lo, mid, 0);
    if (c.cmp(a[mid], a[hi], mid, hi, 0) > 0) c.swap(mid, hi, 0);
    if (c.cmp(a[lo], a[mid], lo, mid, 0) > 0) c.swap(lo, mid, 0);
    return mid;
  }
  function quick(a, c) {
    const stack = [[0, a.length - 1]];
    while (stack.length) {
      let [lo, hi] = stack.pop();
      while (lo < hi) {
        const p = medianIndex(a, lo, hi, c), pivot = a[p];
        c.pivot(p, pivot);
        let lt = lo, i = lo, gt = hi;
        while (i <= gt) {
          const r = c.cmp(a[i], pivot, i, p, 1);
          if (r < 0) { c.swap(lt, i, 2); lt++; i++; }
          else if (r > 0) { c.swap(i, gt, 2); gt--; }
          else i++;
        }
        if (lt - lo < hi - gt) { if (gt + 1 < hi) stack.push([gt + 1, hi]); hi = lt - 1; }
        else { if (lo < lt - 1) stack.push([lo, lt - 1]); lo = gt + 1; }
      }
    }
  }
  function merge(a, c) {
    const aux = new Array(a.length);
    for (let width = 1; width < a.length; width *= 2) {
      for (let lo = 0; lo < a.length; lo += width * 2) {
        const mid = Math.min(lo + width, a.length), hi = Math.min(lo + width * 2, a.length);
        let i = lo, j = mid, k = lo;
        while (i < mid && j < hi) {
          if (c.cmp(a[i], a[j], i, j, 1) <= 0) { aux[k] = a[i++]; }
          else { aux[k] = a[j++]; }
          c.auxWrite(aux[k], k, 2); k++;
        }
        while (i < mid) { aux[k] = a[i++]; c.auxWrite(aux[k], k, 2); k++; }
        while (j < hi) { aux[k] = a[j++]; c.auxWrite(aux[k], k, 2); k++; }
        for (k = lo; k < hi; k++) c.write(k, aux[k], 3);
      }
    }
  }
  function heap(a, c) {
    function sift(start, end) {
      let root = start;
      while (root * 2 + 1 <= end) {
        let child = root * 2 + 1;
        if (child + 1 <= end && c.cmp(a[child], a[child + 1], child, child + 1, 1) < 0) child++;
        if (c.cmp(a[root], a[child], root, child, 1) < 0) { c.swap(root, child, 2); root = child; }
        else return;
      }
    }
    for (let i = Math.floor(a.length / 2) - 1; i >= 0; i--) sift(i, a.length - 1);
    for (let end = a.length - 1; end > 0; end--) { c.swap(0, end, 3); sift(0, end - 1); }
  }
  const ALGORITHMS = { bubble, selection, insertion, quick, merge, heap };
  function sort(name, a, reporter = null, deadline = 0) {
    if (!ALGORITHMS[name]) throw Error("Неизвестный алгоритм");
    const context = createContext(a, reporter, deadline);
    ALGORITHMS[name](a, context);
    return context.metrics;
  }
  function expected(a) { return a.slice().sort((x, y) => x - y); }
  function equal(a, b) { return a.length === b.length && a.every((x, i) => Object.is(x, b[i]) || x === b[i]); }
  function stats(samples) {
    const s = samples.slice().sort((a, b) => a - b);
    const quantile = p => { const x = (s.length - 1) * p, i = Math.floor(x); return s[i] + (s[Math.ceil(x)] - s[i]) * (x - i); };
    return { median: quantile(0.5), q1: quantile(0.25), q3: quantile(0.75), min: s[0], max: s[s.length - 1] };
  }
  const api = { VERSION, GENERATOR_VERSION, LABELS, CASES, PSEUDO, generate, parseNumbers, rng, hashSeed, sort, expected, equal, stats };
  root.SortLabCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
