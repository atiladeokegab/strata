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
