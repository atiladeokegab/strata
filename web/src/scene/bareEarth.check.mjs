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
