// Self-check: `node web/src/scene/bareEarth.check.mjs`
import './google/frame.check.mjs' // check-web runs this file; the GAP envelope check rides along
import assert from 'node:assert/strict'

// city footprints on the bridge's own ground (scene frame = grid turned by the axis; 0 deg keeps them equal)
{
  const { onBridgeGround } = await import('./bareEarth.js')
  const sq = (x, z, r) => [x - r, z - r, x + r, z - r, x + r, z + r, x - r, z + r]
  assert(onBridgeGround(sq(0, -45, 5), 0), 'a block on the north tower is on the bridge')
  assert(onBridgeGround(sq(0, 0, 400), 0), 'a block wrapping the whole bridge is on it')
  assert(onBridgeGround(sq(0, 250, 3), 0), 'a block on the south approach road is on it')
  assert(onBridgeGround(sq(30, 160, 3), 0), 'a block in the engine house is on it')
  assert(!onBridgeGround(sq(0, 250, 3).map((v, i) => (i % 2 ? v : v + 20)), 0), 'a block 20 m off the approach is not')
  assert(!onBridgeGround(sq(-30, 160, 3), 0), 'west of the south approach (no engine house) is clear')
  // turned as three.js rotation-y does: scene (0, -250) on the north approach is grid (250 sin a, -250 cos a)
  const a = (20.95 * Math.PI) / 180
  assert(onBridgeGround(sq(250 * Math.sin(a), -250 * Math.cos(a), 3), 20.95), 'the turned north approach is on it')
  assert(!onBridgeGround(sq(-250 * Math.sin(a), -250 * Math.cos(a), 3), 20.95), 'the mirror turn (the old bake sign) is not')
  console.log('bridge ground ok')
}

// the water's footprint: the river joined to the deck, grown one cell, and never a dry pit cut off from it
{
  const { riverFootprint } = await import('./riverFootprint.js')
  const w = 10, h = 10, heights = new Float32Array(w * h).fill(5)
  for (let i = 0; i < h; i++) for (let j = 4; j <= 6; j++) heights[i * w + j] = 0 // the river, columns 4-6
  heights[1 * w + 1] = 0 // a sunken bowl two cells off the river
  const meta = { bbox_osgb: [0, 0, 40, 40], origin_osgb: [20, 20], water_h: 2 }
  const { positions, index } = riverFootprint({ meta, heights, w, h })
  assert.equal(index.length, 6 * h, 'one quad per row: the river and its grown edge, not the bowl')
  for (let q = 0; q < positions.length; q += 12) assert.deepEqual([positions[q], positions[q + 3]], [-8, 12], 'columns 3-7, in metres from the deck')
  assert.deepEqual(positions.slice(0, 3), [-8, 0, -16], 'the north row is at z -20..-16 (south +)')
  assert.throws(() => riverFootprint({ meta, heights: new Float32Array(w * h).fill(5), w, h }), /above the water line/)
  console.log('river footprint ok')
}

// the approach streets: level with the deck ends, falling to APPROACH.to, the rest of the ground untouched
{
  const { levelStreets, STREETS, APPROACH } = await import('./bareEarth.js')
  const n = 801, meta = { bbox_osgb: [0, 0, n, n], origin_osgb: [400.5, 400.5], origin_h: 10, bridge_axis_deg: 0 }
  const heights = levelStreets({ meta, heights: new Float32Array(n * n).fill(1), w: n, h: n })
  const at = (x, z) => heights[(z + 400) * n + (x + 400)] - meta.origin_h // scene y at bridge x, z (axis 0: grid = bridge)
  const near = (a, b, m) => assert(Math.abs(a - b) < 1e-3, `${m}: ${a} vs ${b}`)
  near(at(0, -184), STREETS.north[0] - 0.7 * 0.5 / 136.5, 'the north street meets the deck end')
  near(at(-STREETS.half, 184), STREETS.south[0] - 3.4 * 0.5 / 136.5, 'the south street is level across, to its edge')
  near(at(10, 320), STREETS.south[1], 'it falls to the city level at APPROACH.to')
  near(at(0, 100), -9, 'under the bridge: untouched')
  near(at(STREETS.edge + 5, -250), -9, 'beyond the edge: untouched')
  near(at(0, APPROACH.to + 30), -9, 'past the south fade: untouched')
  near(at(0, -360), STREETS.north[1], 'the north street carries on level over the hollow')
  console.log('approach streets ok')
}

// before the opening: the ramps' footprints sink to their foot, the DTM elsewhere stays as surveyed
{
  const { rampFloor, STREETS, RAMP_FLOOR } = await import('./bareEarth.js')
  const n = 801, meta = { bbox_osgb: [0, 0, n, n], origin_osgb: [400.5, 400.5], origin_h: 10, bridge_axis_deg: 0 }
  const heights = rampFloor({ meta, heights: new Float32Array(n * n).fill(10), w: n, h: n }) // a viaduct at deck level
  const at = (x, z) => heights[(z + 400) * n + (x + 400)] - meta.origin_h
  const near = (a, b, m) => assert(Math.abs(a - b) < 1e-3, `${m}: ${a} vs ${b}`)
  near(at(0, -160), STREETS.north[0] - RAMP_FLOOR.below, 'under the north ramp: just below its foot')
  near(at(9, 170), STREETS.south[0] - RAMP_FLOOR.below, 'under the south ramp, out to its parapet')
  near(at(0, 200), 0, 'past the ramp end: as surveyed')
  near(at(20, 160), 0, 'beside the ramp: as surveyed')
  near(at(0, 100), 0, 'under the bridge: as surveyed')
  const low = rampFloor({ meta, heights: new Float32Array(n * n).fill(0), w: n, h: n })
  assert.equal(low[(160 + 400) * n + 400], 0, 'ground already below the foot stays')
  console.log('ramp floor ok')
}

// the river's shelves: low ground joined to the river within reach sinks to the bed; banks, far shelves and pits stay
{
  const { sinkShelves, SHELVES } = await import('./bareEarth.js')
  const n = 201, meta = { bbox_osgb: [0, 0, n, n], origin_osgb: [100.5, 100.5], water_h: 2 }
  const heights = new Float32Array(n * n).fill(10) // a bank, well above the water
  const set = (j0, j1, i0, i1, v) => { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) heights[i * n + j] = v }
  set(0, 200, 90, 110, 0) // the river, rows 90-110, under the deck at (100, 100)
  set(0, 200, 111, 111 + SHELVES.reach + 20, 3) // a shelf off its south side, 80 m deep
  set(20, 30, 20, 30, 3) // a low pit inland, at shelf level but not joined to the river
  sinkShelves({ meta, heights, w: n, h: n })
  assert.equal(heights[(111 + 10) * n + 50], 0, 'a shelf 10 m out sinks to the bed (2 m under the water)')
  assert.equal(heights[(111 + SHELVES.reach + 10) * n + 50], 3, 'past reach it stays')
  assert.equal(heights[25 * n + 25], 3, 'an inland pit stays')
  assert.equal(heights[80 * n + 50], 10, 'the bank stays')
  console.log('river shelves ok')
}

// the docks: the basin flat at its median, the fringe outside the outline brought up to the quay, the river bed and
// ground past reach untouched
{
  const { snapDocks, DOCK_EDGE } = await import('./bareEarth.js')
  const n = 80, heights = new Float32Array(n * n).fill(7), data = new Uint8Array(n * n * 4)
  const inDock = (i, j) => i >= 20 && i < 40 && j >= 20 && j < 40
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = i * n + j, out = Math.max(20 - i, i - 39, 20 - j, j - 39)
    if (inDock(i, j)) { data[k * 4] = 255; heights[k] = 4 + ((i + j) % 3) * 0.1 } else if (out <= 3) heights[k] = 4.5 + (k % 2) // the ragged fringe
  }
  for (let i = 20; i < 40; i++) for (let j = 0; j < 17; j++) heights[i * n + j] = 2.5 // west: low ground, no quay in the DTM
  heights[30 * n + 41] = 0 // the river's bed, 2 m out
  const dip = 30 * n + 39 + Math.round((DOCK_EDGE.taper + DOCK_EDGE.reach) / 2)
  heights[dip] = 5 // a dip between taper and reach
  const meta = { bbox_osgb: [0, 0, n, n], water_h: 2.3 }
  snapDocks({ meta, heights, w: n, h: n }, { data, w: n, h: n })
  for (let i = 20; i < 40; i++) for (let j = 20; j < 40; j++) assert.equal(heights[i * n + j], heights[20 * n + 20], 'the basin is one flat sheet')
  assert(Math.abs(heights[20 * n + 20] - 4.1) < 1e-6, `at its median: ${heights[20 * n + 20]}`)
  for (let d = 1; d <= DOCK_EDGE.taper; d++) assert.equal(heights[25 * n + 39 + d], 7, `the fringe ${d} m out is quay`)
  for (let d = 1; d <= DOCK_EDGE.taper; d++) assert(Math.abs(heights[30 * n + 20 - d] - (4.1 + DOCK_EDGE.rise)) < 1e-6, `low ground ${d} m out rises to the quay: ${heights[30 * n + 20 - d]}`)
  assert.equal(heights[30 * n + 41], 0, 'the river bed is never raised')
  assert(heights[dip] > 5 && heights[dip] < 7, `the taper: ${heights[dip]}`)
  assert.equal(heights[5 * n + 5], 7, 'far ground stays')
  assert.equal(snapDocks({ meta, heights: Float32Array.of(1, 2, 3, 4), w: 2, h: 2 }, { data: new Uint8Array(16), w: 2, h: 2 })[2], 3, 'no docks: untouched')
  console.log('dock edge ok')
}
