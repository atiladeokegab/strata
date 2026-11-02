// Self-check: `node web/src/scene/bareEarth.check.mjs`
import assert from 'node:assert/strict'
import { bareEarth, keepApproaches, LIFT } from './bareEarth.js'

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
// a raised approach road on the bridge axis (axis due north, origin mid-grid): kept; off the corridor: still opened
const meta = { bridge_axis_deg: 0, bbox_osgb: [0, 0, 400, 400], origin_osgb: [200, 200] }, W = 400
const dsm = new Float32Array(W * W).fill(0), at = (along, across) => (200 - along) * W + 200 + across
for (let a = 100; a < 200; a++) for (let c = -8; c <= 8; c++) dsm[at(a, c)] = 7 // viaduct, 17 m wide
for (let a = 140; a < 170; a++) for (let c = 12; c < 20; c++) dsm[at(a, c)] = 30 // a building lining the road
for (let a = 150; a < 170; a++) for (let c = 22; c < 30; c++) dsm[at(a, c)] = 25 // its neighbour, outside the corridor
for (let a = 175; a < 178; a++) dsm[at(a, -14)] = 20 // a tree
for (let a = 190; a < 199; a++) for (let c = -10; c <= 10; c++) dsm[at(a, c)] = 30 // a building across the axis where the road bends
const kept = keepApproaches(bareEarth(dsm, W, W, 30), dsm, W, meta)
assert.equal(kept[at(150, 0)], 7, 'approach road keeps its DSM height')
assert.ok(kept[at(150, 30)] <= 0, 'beside the corridor is still bare earth')
assert.equal(kept[at(150, 15)], 7, 'a roadside roof in the corridor is cut to the road')
assert.equal(kept[at(176, -14)], 7, 'and so is a tree')
assert.ok(kept[at(160, 25)] <= LIFT, 'outside the corridor it is opened away')
assert.equal(kept[at(195, 0)], 7, 'a building across the axis comes down to the road before it')
assert.ok(kept[at(50, 0)] <= LIFT, 'inside the bridge cut is untouched')
console.log('bareEarth ok')
