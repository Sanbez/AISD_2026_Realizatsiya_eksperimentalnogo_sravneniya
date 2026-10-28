const assert = require("node:assert/strict");
const C = require("../dist/core.js");

const inputs = [
  [], [1], [2, 1], [3, 3, 3], [-5, 0, 4, -5, 9],
  [5, 4, 3, 2, 1], Array.from({ length: 100 }, (_, i) => 100 - i)
];
for (let seed = 0; seed < 40; seed++) {
  inputs.push(C.generate("random", seed * 7, seed, { min: -50, max: 50 }));
}
for (const name of Object.keys(C.LABELS)) {
  for (const input of inputs) {
    const reference = C.expected(input);
    const plain = input.slice();
    C.sort(name, plain);
    assert.deepEqual(plain, reference, name + " plain");
    const counted = input.slice();
    const metrics = C.sort(name, counted, () => {});
    assert.deepEqual(counted, reference, name + " counted");
    assert.ok(Number.isSafeInteger(metrics.comparisons));
    assert.ok(Number.isSafeInteger(metrics.swaps));
    assert.ok(Number.isSafeInteger(metrics.writes));
  }
}
const a = C.generate("random", 100, 123, { min: -9, max: 9 });
const b = C.generate("random", 100, 123, { min: -9, max: 9 });
assert.deepEqual(a, b, "seed reproduces data");
const n = 17, reverse = Array.from({ length: n }, (_, i) => n - i);
const metrics = C.sort("selection", reverse, () => {});
assert.equal(metrics.comparisons, n * (n - 1) / 2);
assert.deepEqual(C.generate("duplicates", 20, 1, { min: 3, max: 3, distinct: 5 }), Array(20).fill(3));
console.log("OK: six algorithms, edge cases, seeded data and operation invariants");
