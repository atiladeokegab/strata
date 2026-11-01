// Self-check: `node web/src/scene/bareEarth.check.mjs`
import assert from 'node:assert/strict'
import { bareEarth, LIFT } from './bareEarth.js'

const w = 200, h = 150, ground = (x, y) => 5 + x * 0.02 // a gentle slope
const hs = new Float32Array(w * h)
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hs[y * w + x] = ground(x, y)
for (let y = 60; y < 80; y++) for (let x = 90; x < 115; x++) hs[y * w + x] = 60 // a 25 x 20 m building
for (let y = 0; y < h; y++) for (let x = 0; x < 30; x++) hs[y * w + x] = -2 // the river along one edge
const out = bareEarth(hs, w, h, 15)
assert.ok(Math.abs(out[70 * w + 100] - ground(100, 70)) < LIFT + 0.6, 'the building is gone')
assert.equal(out[70 * w + 10], -2, 'the river stays down')
assert.ok(Math.abs(out[20 * w + 150] - ground(150, 20)) < 1e-4, 'open ground is untouched')
assert.ok(out.every((v, i) => v <= hs[i]), 'never above the DSM')
console.log('bareEarth ok')
