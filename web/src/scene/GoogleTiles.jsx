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
import { useGoogle } from './google/state'
import { FRAME_ROTATION_Y, ORIGIN, cutGap } from './google/frame'

const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
const rad = THREE.MathUtils.degToRad

function clipGap({ scene }) {
  scene.traverse((o) => { if (o.material) [o.material].flat().forEach(cutGap) })
}

export function GoogleTiles() {
  const lidar = useStore((s) => s.lidar)
  const [key, setKey] = useState(null)
  const [t, setTiles] = useState(null) // the TilesRenderer, once it exists

  useEffect(() => {
    fetch('/api/config').then((r) => (r.ok ? r.json() : {})).then((c) => {
      if (c.google_tiles_key) setKey(c.google_tiles_key)
      else useGoogle.setState({ status: 'failed' })
    }).catch(() => useGoogle.setState({ status: 'failed' }))
  }, [])

  useEffect(() => {
    if (!t) return
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
    // ready once the first view has finished streaming, so the terrain and buildings never vanish before the tiles show
    const ready = () => { if (t.visibleTiles.size) useGoogle.setState({ status: 'ready' }) }
    const failed = (e) => { if (!t.root) useGoogle.setState({ status: 'failed' }); console.warn('[strata] Google tiles:', e?.error?.message || e) }
    t.addEventListener('load-model', clipGap)
    t.addEventListener('tiles-load-end', ready)
    t.addEventListener('tile-visibility-change', credit)
    t.addEventListener('load-error', failed)
    if (import.meta.env.DEV) { // dev probe: ellipsoid/frame calibration from the browser console
      window.__strataTiles = t
      window.__strataProbe = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, 600, z), new THREE.Vector3(0, -1, 0)).intersectObject(t.group, true)[0]?.point.y
    }
    return () => {
      t.removeEventListener('load-model', clipGap)
      t.removeEventListener('tiles-load-end', ready)
      t.removeEventListener('tile-visibility-change', credit)
      t.removeEventListener('load-error', failed)
    }
  }, [t])

  if (!key) return null
  return (
    <group rotation-y={FRAME_ROTATION_Y} visible={!lidar}>
      {/* errorTarget 20 is Google's recommendation; on a laptop at street level it keeps ~150 tiles. */}
      <TilesRenderer ref={setTiles} errorTarget={20} enabled={!lidar} lruCache-minSize={600} lruCache-maxSize={900}>
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
  const lidar = useStore((s) => s.lidar)
  const { status, credit } = useGoogle()
  if (lidar || status !== 'ready') return null
  return <span className="google-credit"> · 3D tiles {credit || 'Google'}</span>
}

export default GoogleTiles
