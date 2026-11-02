// node --test: the real 3d-tiles-renderer traversal and LRU cache on a tiny tileset, reproducing the live stall where
// Google's tiles loaded (351 in cache, cache full) yet none drew. Tiles that land after the cache is full are discarded and
// then refused for good (every cached tile is in use, so nothing can be evicted). With loadAncestors on, a coarse tile whose
// children are not all ready stands in for its whole subtree, so a refused coarse tile hides every loaded tile under it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TilesRendererBase } from '3d-tiles-renderer/core'
import { TILE_LOADING } from './load.js'

globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 0)
globalThis.cancelAnimationFrame ??= (h) => clearTimeout(h)
globalThis.window ??= { location: { href: 'http://test/' } } // the library resolves tile URLs against the page

// root (empty) -> T (coarse) -> 4 x C -> 4 x 4 G leaves; screen error is the geometric error
const leaf = (id) => ({ boundingVolume: { sphere: [0, 0, 0, 1] }, geometricError: 0, refine: 'REPLACE', content: { uri: `${id}.glb` } })
const tileset = {
  asset: { version: '1.0' }, geometricError: 1000,
  root: { boundingVolume: { sphere: [0, 0, 0, 100] }, geometricError: 1000, refine: 'REPLACE', children: [{
    boundingVolume: { sphere: [0, 0, 0, 100] }, geometricError: 100, refine: 'REPLACE', content: { uri: 'T.glb' },
    children: [0, 1, 2, 3].map((i) => ({
      boundingVolume: { sphere: [0, 0, 0, 10] }, geometricError: 10, refine: 'REPLACE', content: { uri: `C${i}.glb` },
      children: [0, 1, 2, 3].map((j) => leaf(`G${i}${j}`)),
    })),
  }] },
}
const BYTES = { T: 100, C: 30, G: 10 } // the used set is 380 bytes; the cache holds 230
// the order downloads land in: leaves first, one leaf (G33) late, coarse tiles last, so C3, G33 and T meet a full cache
const ORDER = [0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].map((j) => `G${i}${j}`)).filter((id) => id !== 'G33').concat('C0', 'C1', 'C2', 'C3', 'G33', 'T')

class Fake extends TilesRendererBase {
  calculateTileViewError(tile, target) { target.inView = true; target.error = tile.geometricError; target.distanceFromCamera = 1 }
  async parseTile(buffer, tile) { tile.engineData.scene = {} }
}

async function settle(options) {
  const t = new Fake('http://test/tileset.json')
  Object.assign(t, { errorTarget: 5, ...options })
  Object.assign(t.lruCache, { minSize: 0, maxSize: 1000, minBytesSize: 0, maxBytesSize: 230 })
  t.downloadQueue.maxJobsPerOrigin = 30
  const pending = new Map() // tile id -> releases its download
  t.registerPlugin({
    fetchData: (url) => {
      const id = url.split('/').pop().replace('.glb', '')
      if (id === 'tileset.json') return Promise.resolve(new Response(JSON.stringify(tileset)))
      return new Promise((r) => pending.set(id, () => r(new Response(new ArrayBuffer(8)))))
    },
    calculateBytesUsed: (tile) => (tile.engineData.scene ? BYTES[tile.content.uri.split('/').pop()[0]] : 0),
  })
  for (let i = 0; i < 120; i++) { // an update every "frame", the generous case: the live app updates only on change
    t.update()
    await new Promise((r) => setTimeout(r, 1))
    const next = ORDER.find((id) => pending.has(id))
    if (next) { pending.get(next)(); pending.delete(next) }
  }
  const s = { visible: t.stats.visible, loaded: t.stats.loaded, full: t.lruCache.isFull() }
  t.dispose()
  return s
}

test('the library default (loadAncestors) draws nothing once the cache fills before the coarse tiles land', async () => {
  const s = await settle({ loadAncestors: true })
  assert.deepEqual(s, { visible: 0, loaded: 18, full: true }) // the live symptom; if this changes, the library did, and load.js can be revisited
})

test('our loading options draw the loaded tiles under the same cache pressure', async () => {
  const s = await settle(TILE_LOADING)
  assert.deepEqual(s, { visible: 16, loaded: 16, full: false })
})
