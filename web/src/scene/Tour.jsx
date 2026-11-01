// <Tour />: mount inside the R3F <Canvas>. Plays the guided story while useTour.playing; any key, drag or wheel stops it.
// ?tour=1 in the URL starts it once the place has loaded (for recording the film).
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Box3, Vector3 } from 'three'
import { useStore, THIS_YEAR } from '../store.js'
import { useTour, startTour, stopTour, DURATION, poseAt, runTracks, hydraulicsPart } from '../tour/tour.js'

export default function Tour() {
  const playing = useTour((s) => s.playing)
  const { camera, scene, gl } = useThree()
  const run = useRef(null) // {prev, ctx, centres}

  // ?tour=1: start when the place is in (or after 4 s regardless, so a dead API never blocks a take).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tour') !== '1') return
    let go = () => { go = () => {}; startTour() }
    const timer = setTimeout(() => go(), 4000)
    const off = useStore.subscribe((s) => s.place && setTimeout(() => go(), 1200))
    if (useStore.getState().place) setTimeout(() => go(), 1200)
    return () => { clearTimeout(timer); off() }
  }, [])

  useEffect(() => {
    if (!playing) return
    const place = useStore.getState().place
    run.current = { prev: -1, ctx: { hydraulics: hydraulicsPart(place, (id) => !!scene.getObjectByName(id)) }, centres: {} }
    if (camera.far < 6000) { camera.far = 6000; camera.updateProjectionMatrix() } // the opening shot is ~1 km out
    const el = gl.domElement
    const interrupt = () => {
      stopTour()
      const s = useStore.getState() // leave the place in a sane state, wherever the story was cut
      s.setBascule(0); s.setExploded(false); s.setYear(THIS_YEAR)
      if (s.view === 'top') s.setView('orbit')
    }
    window.addEventListener('keydown', interrupt)
    el.addEventListener('pointerdown', interrupt)
    el.addEventListener('wheel', interrupt, { passive: true })
    return () => {
      window.removeEventListener('keydown', interrupt)
      el.removeEventListener('pointerdown', interrupt)
      el.removeEventListener('wheel', interrupt)
    }
  }, [playing, camera, gl, scene])

  // Default priority: runs after drei controls (priority -1), so the tour owns the camera while it plays.
  useFrame((state) => {
    const r = run.current
    if (!useTour.getState().playing || !r) return
    const t = Math.min(DURATION, (performance.now() - useTour.getState().startedAt) / 1000)
    runTracks(r.prev, t, r.ctx)
    r.prev = t
    const { pos, target } = poseAt(t, (k) => (k.part ? partCentre(scene, r, r.ctx.hydraulics) ?? k.target : k.target))
    camera.position.set(...pos)
    camera.lookAt(...target)
    if (state.controls?.target) state.controls.target.set(...target) // hand over without a jump
    if (t >= DURATION) stopTour()
  })

  return null
}

// Centre of the mesh named partId, measured once per run (the bridge may still be landing, so it can be missing).
function partCentre(scene, r, partId) {
  if (!(partId in r.centres)) {
    const obj = scene.getObjectByName(partId)
    r.centres[partId] = obj ? new Box3().setFromObject(obj).getCenter(new Vector3()).toArray() : null
  }
  return r.centres[partId]
}
