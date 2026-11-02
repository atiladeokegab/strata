// Google Photorealistic 3D Tiles of London around our procedural Tower Bridge, with Google's own bridge clipped out.
// Streams with NASA-AMMOS 3d-tiles-renderer; the browser key comes from GET /api/config at runtime.
import { useEffect, useState } from 'react'
import { TilesRenderer, TilesPlugin } from '3d-tiles-renderer/r3f'
import {
  GLTFExtensionsPlugin, ReorientationPlugin, TileCompressionPlugin, UpdateOnChangePlugin, UnloadTilesPlugin, TilesFadePlugin,
} from '3d-tiles-renderer/plugins'
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import * as THREE from 'three'
import { useStore } from '../store'
import { useGoogle, useGoogleShown, useGoogleWanted } from './google/state'
import { LITE } from './look/tier'
import { FRAME_ROTATION_Y, ORIGIN, cutGap, inGap } from './google/frame'

const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
const rad = THREE.MathUtils.degToRad

// Budget: Google's city streamed without limit (next20 desktop 1289 calls, 4.7M tris at 130 s). Coarser error,
// a cache that disposes unused tiles (bytes are the real cap: the item count also holds Google's nested tileset JSONs,
// ancestors and siblings, and a 200-item cap refused every LITE tile on next21), and detail that falls off past R metres from the bridge.
const BUDGET = LITE
  ? { errorTarget: 32, R: 400, minSize: 300, maxSize: 1000, minBytes: 60e6, maxBytes: 120e6 }
  : { errorTarget: 24, R: 600, minSize: 400, maxSize: 1500, minBytes: 120e6, maxBytes: 220e6 }

function clipGap({ scene }) {
  scene.traverse((o) => {
    if (o.material) [o.material].flat().forEach(cutGap)
    if (o.isMesh) o.userData.noShadow = true // photogrammetry has its shadows baked in; Look would add a shadow-map draw per mesh
  })
}

// beyond R from the bridge a tile's screen error shrinks with distance squared, so the far city stays coarse
function radiusFalloff(t) {
  if (t.calculateTileViewError.falloff) return // StrictMode runs the effect twice
  const bridge = new THREE.Vector3()
  const base = t.calculateTileViewError.bind(t)
  t.calculateTileViewError = (tile, target) => {
    base(tile, target)
    bridge.setFromMatrixPosition(t.group.matrixWorldInverse) // the world origin (deck centre) in the tileset frame
    const d = tile.engineData.boundingVolume.distanceToPoint(bridge)
    if (d > BUDGET.R) target.error *= (BUDGET.R / d) ** 2
  }
  t.calculateTileViewError.falloff = true
}

// fetched when this chunk loads, not on mount: the mount waits seconds behind the scene's first loads, and the
// loading card waits on Google's answer (a 403 arrives only after the key and the root request)
const config = fetch('/api/config').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))

export function GoogleTiles() {
  const wanted = useGoogleWanted(useStore((s) => s.lidar))
  const [key, setKey] = useState(null)
  const [t, setTiles] = useState(null) // the TilesRenderer, once it exists

  useEffect(() => {
    config.then((c) => {
      if (c.google_tiles_key) setKey(c.google_tiles_key)
      else useGoogle.setState({ status: 'failed' })
    })
  }, [])

  useEffect(() => {
    if (!t) return
    radiusFalloff(t)
    if (LITE) { t.downloadQueue.maxJobsPerOrigin = 6; t.parseQueue.maxJobs = 2 } // phones: fewer tiles in flight at once
    let queued = false
    const credit = () => {
      if (queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        const value = t.getAttributions().filter((a) => a.type === 'string').map((a) => a.value).join(' ')
        useGoogle.setState({ credit: value })
      })
    }
    // ready once tiles are on screen: tiles-load-end alone waits for every queue to drain, which an orbiting camera
    // never allows (next21: tiles drawing, status stuck on 'loading')
    const ready = () => { if (t.visibleTiles.size && useGoogle.getState().status === 'loading') useGoogle.setState({ status: 'ready' }) }
    const failed = (e) => { if (!t.root) useGoogle.setState({ status: 'failed' }); console.warn('[strata] Google tiles:', e?.error?.message || e) }
    t.addEventListener('load-model', clipGap)
    t.addEventListener('tiles-load-end', ready)
    t.addEventListener('tile-visibility-change', credit)
    t.addEventListener('tile-visibility-change', ready)
    t.addEventListener('load-error', failed)
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('capture')) {
      window.__strataTiles = t // the tiles budget test counts its meshes
      // which drawn tile a ray from `from` toward `to` (our frame, metres) meets first, skipping what GAP discards:
      // a coarse ancestor still drawn because its children are missing shows as a low depth with few loaded children
      window.__strataTileHit = (from, to) => {
        const o = new THREE.Vector3(...from), hits = new THREE.Raycaster(o, new THREE.Vector3(...to).sub(o).normalize()).intersectObject(t.group, true)
        const hit = hits.find((h) => !inGap(h.point.x, h.point.y, h.point.z))
        if (!hit) return null
        let tile = null
        t.forEachLoadedModel((scene, tl) => scene.traverse((m) => { if (m === hit.object) tile = tl }))
        return { point: hit.point.toArray().map((v) => +v.toFixed(1)), distance: +hit.distance.toFixed(1), depth: tile?.internal?.depth,
          geometricError: tile?.geometricError, children: tile?.children.length, childrenLoaded: tile?.children.filter((c) => c.engineData?.scene).length,
          gapHitsBefore: hits.indexOf(hit), lru: [t.lruCache.itemSet.size, t.lruCache.maxSize] }
      }
    }
    if (import.meta.env.DEV) { // dev probe: ellipsoid/frame calibration from the browser console
      window.__strataProbe = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, 600, z), new THREE.Vector3(0, -1, 0)).intersectObject(t.group, true)[0]?.point.y
    }
    return () => {
      t.removeEventListener('load-model', clipGap)
      t.removeEventListener('tiles-load-end', ready)
      t.removeEventListener('tile-visibility-change', credit)
      t.removeEventListener('tile-visibility-change', ready)
      t.removeEventListener('load-error', failed)
    }
  }, [t])

  if (!key) return null
  return (
    <group rotation-y={FRAME_ROTATION_Y} visible={wanted}>
      <TilesRenderer ref={setTiles} errorTarget={BUDGET.errorTarget} enabled={wanted}
        lruCache-minSize={BUDGET.minSize} lruCache-maxSize={BUDGET.maxSize} lruCache-minBytesSize={BUDGET.minBytes} lruCache-maxBytesSize={BUDGET.maxBytes}>
        <TilesPlugin plugin={GoogleCloudAuthPlugin} args={{ apiToken: key, autoRefreshToken: true }} />
        <TilesPlugin plugin={GLTFExtensionsPlugin} args={{ dracoLoader: draco }} />
        <TilesPlugin plugin={ReorientationPlugin} args={{ lat: rad(ORIGIN.lat), lon: rad(ORIGIN.lon), height: ORIGIN.height }} />
        <TilesPlugin plugin={TileCompressionPlugin} />
        <TilesPlugin plugin={UpdateOnChangePlugin} />
        <TilesPlugin plugin={UnloadTilesPlugin} />
        <TilesPlugin plugin={TilesFadePlugin} />
      </TilesRenderer>
    </group>
  )
}

// The copyright line Google requires while its tiles are on screen; build-4 mounts this in the credit pill.
export function GoogleCredit() {
  const shown = useGoogleShown(useStore((s) => s.lidar))
  const credit = useGoogle((s) => s.credit)
  if (!shown) return null
  return <span className="google-credit"> · 3D tiles {credit || 'Google'}</span>
}

export default GoogleTiles
