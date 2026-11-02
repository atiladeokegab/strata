// <ReadyProbe /> lives inside the Canvas: it tracks the real loads (place data, LiDAR terrain, the bridge, the river, textures
// through three's loading manager, Google's 3D city) and sets sceneSettled once all are in and the scene has drawn
// half a second of frames. It feeds the DOM card in ui/SceneLoading.jsx through useLoad.
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { DefaultLoadingManager } from 'three'
import { useLoad } from './SceneLoading'
import { useStore, TILES, EMBED } from '../store'

const google = Object.values(import.meta.glob('../scene/google/state.js', { eager: true }))[0]
const terrainChunk = import.meta.glob('../scene/Terrain.jsx')['../scene/Terrain.jsx']
// Our own textures and HDRI, counted through three's default loading manager. Google's tile images
// (blob: URLs out of its glTFs) stream for as long as the camera moves, so they are left out: the
// 3D city step waits for Google's first view instead.
// Loads that start after the first lit frame (store.sceneReady: the photo textures and the warm-up, which wait for
// it) are not counted either: they re-opened this step and held the card a further 2-20 s.
const own = (url) => !/^(blob|data):/.test(url) && !/googleapis/.test(url)
const tex = { pending: 0, done: 0 }, counted = new Map() // url -> loads in flight that were counted (one url can load twice)
const mgr = DefaultLoadingManager, itemStart = mgr.itemStart.bind(mgr), itemEnd = mgr.itemEnd.bind(mgr)
mgr.itemStart = (url) => { if (own(url) && !useStore.getState().sceneReady) { counted.set(url, (counted.get(url) ?? 0) + 1); tex.pending++ } itemStart(url) }
mgr.itemEnd = (url) => { // errors end too
  const n = counted.get(url)
  if (n) { if (n > 1) counted.set(url, n - 1); else counted.delete(url); tex.pending--; tex.done++ }
  itemEnd(url)
}
let terrainIn = !terrainChunk
const SETTLE = 0.5 // s of frames with everything in before the card lifts
// ms: a Google view that has neither arrived nor failed by then (slow or stalled) settles without it. The portfolio's
// embed waits 2.5 s: its card must lift inside 5 s, and a 403 lands only after the bridge is built (root request, then a
// retry), so it hit the 8 s cap; tiles that arrive later fade in under the hero shot (TilesFadePlugin)
const CITY_WAIT = EMBED ? 2500 : 8000
const RIVER_WAIT = 4000 // ms: the river (scene/Water.jsx 'thames', the mirror on desktop) or the card lifts without it
const waterSlot = !!import.meta.glob('../scene/Water.jsx')['../scene/Water.jsx'] // no file: the stand-in is the river

// Never re-renders: loads start inside other components' renders (pbr() and friends), and a probe that
// re-rendered on them restarted the suspended scene slots for ever. So it polls plain values each frame.
export function ReadyProbe() {
  const scene = useThree((s) => s.scene)
  const held = useRef(0)
  const last = useRef('')
  const bridge = useRef(false)
  const river = useRef(false)
  const start = useRef(0)
  useEffect(() => { terrainChunk?.().then((m) => m.loadTerrain()).finally(() => { terrainIn = true }) }, [])
  useFrame((_, dt) => {
    const st = useStore.getState()
    if (st.sceneSettled) return
    bridge.current ||= !!scene.getObjectByName('tower-bridge')
    const wanted = TILES && !!google && st.year >= google.GOOGLE_FROM && !st.lidar
    start.current ||= performance.now()
    const city = !wanted || google.useGoogle.getState().status !== 'loading' || performance.now() - start.current > CITY_WAIT
    river.current ||= !waterSlot || !!scene.getObjectByName('thames') || performance.now() - start.current > RIVER_WAIT
    const place = !!st.place, active = tex.pending > 0, total = tex.pending + tex.done
    const steps = [
      ['History', place], ['LiDAR ground', terrainIn], // textures before the bridge: it waits on them, and their count moves
      [total ? `Textures ${tex.done} of ${total}` : 'Textures', !active && bridge.current, total ? tex.done / total : 0],
      ['Bridge', bridge.current], ['River', river.current], ['3D city', city],
    ]
    const key = JSON.stringify(steps)
    if (key !== last.current) { // the DOM card's store only; nothing in the Canvas listens to it
      last.current = key
      useLoad.setState({ steps, frac: steps.reduce((a, [, done, part]) => a + (done ? 1 : part ?? 0), 0) / (steps.length + 1) })
    }
    held.current = steps.every(([, done]) => done) ? held.current + dt : 0
    if (held.current >= SETTLE) st.setSceneSettled(true)
  })
  return null
}

