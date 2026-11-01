// Orbit, top-down and walk. Switching flies the camera to the view's start in under a second.
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Box3, Raycaster, Vector3, MathUtils } from 'three'
import { useStore } from '../store'
import { isTourPlaying } from '../tour/tour.js'

export const EYE = 1.7 // walk height above the road deck, metres
const PRESETS = {
  orbit: { pos: [170, 75, 190], target: [0, 18, 0] },
  top: { pos: [0, 700, 0.01], target: [0, 0, 0] },
  walk: { pos: [0, EYE, 105], target: [0, EYE, 0] }, // south approach, clear of the towers even when exploded, looking north along the deck
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export function CameraRig() {
  const view = useStore((s) => s.view)
  const selected = useStore((s) => s.selected)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const controls = useRef()
  const fly = useRef(null)

  useEffect(() => {
    const p = PRESETS[view]
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const fromTarget = controls.current?.target.clone() ?? camera.getWorldDirection(new Vector3()).multiplyScalar(50).add(camera.position)
    fly.current = { t: reduce ? 1 : 0, from: camera.position.clone(), to: new Vector3(...p.pos), fromTarget, toTarget: new Vector3(...p.target) }
  }, [view, camera])

  const cameraTo = useStore((s) => s.cameraTo)
  useEffect(() => {
    if (!cameraTo) return
    const to = new Vector3(...cameraTo)
    // look at the bridge, but low enough that orbit's polar limit does not lift the camera
    const toTarget = new Vector3(0, to.y - 0.1 * Math.hypot(to.x, to.z), 0)
    const fromTarget = controls.current?.target.clone() ?? new Vector3(0, 18, 0)
    fly.current = { t: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0, from: camera.position.clone(), to, fromTarget, toTarget }
    useStore.setState({ cameraTo: null })
  }, [cameraTo, camera])

  // fly to a part when it is selected: keep the current viewing angle, frame its bounds
  useEffect(() => {
    if (!selected || view === 'walk' || !controls.current || isTourPlaying()) return // the tour frames its own close-ups
    const box = new Box3()
    scene.traverse((o) => { if (o.name === selected && o.isMesh) box.expandByObject(o) })
    if (box.isEmpty()) return
    const centre = box.getCenter(new Vector3())
    const radius = Math.max(box.getSize(new Vector3()).length() / 2, 6)
    const fromTarget = controls.current.target.clone()
    const dir = camera.position.clone().sub(fromTarget).normalize()
    const to = view === 'top'
      ? new Vector3(centre.x, Math.max(radius * 3, 120), centre.z + 0.01)
      : centre.clone().add(dir.multiplyScalar(MathUtils.clamp(radius * 3.2, 60, 900)))
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    fly.current = { t: reduce ? 1 : 0, from: camera.position.clone(), to, fromTarget, toTarget: centre }
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const f = fly.current
    if (!f) return
    f.t = Math.min(1, f.t + dt / 1.1)
    const k = ease(f.t)
    camera.position.lerpVectors(f.from, f.to, k)
    const target = new Vector3().lerpVectors(f.fromTarget, f.toTarget, k)
    if (controls.current) { controls.current.target.copy(target); controls.current.update() } else camera.lookAt(target)
    if (f.t === 1) fly.current = null
  })

  if (view === 'walk') return <WalkControls fly={fly} />
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      minDistance={15}
      maxDistance={1600}
      minPolarAngle={0}
      maxPolarAngle={view === 'top' ? 0 : Math.PI * 0.47} // top-down stays straight down; orbit never dips under the ground
    />
  )
}

// first person: WASD or arrows to walk (Shift to run), drag to look
const DOWN = new Vector3(0, -1, 0)
const ray = new Raycaster()
ray.far = 60

function WalkControls({ fly }) {
  const { camera, gl, scene } = useThree()
  const keys = useRef(new Set())
  const look = useRef({ yaw: 0, pitch: 0 })

  useEffect(() => {
    camera.rotation.order = 'YXZ'
    look.current = { yaw: 0, pitch: 0 }
    const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
    const down = (e) => { if (!typing(e)) keys.current.add(e.code) }
    const up = (e) => keys.current.delete(e.code)
    const blur = () => keys.current.clear()
    let drag = null
    const el = gl.domElement
    const pd = (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId) }
    const pm = (e) => {
      if (!drag) return
      const l = look.current
      l.yaw -= (e.clientX - drag.x) * 0.0035
      l.pitch = MathUtils.clamp(l.pitch - (e.clientY - drag.y) * 0.0035, -1.2, 1.2)
      drag = { x: e.clientX, y: e.clientY }
    }
    const pu = () => { drag = null }
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', blur)
    el.addEventListener('pointerdown', pd); el.addEventListener('pointermove', pm); el.addEventListener('pointerup', pu); el.addEventListener('pointercancel', pu)
    return () => {
      removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur)
      el.removeEventListener('pointerdown', pd); el.removeEventListener('pointermove', pm); el.removeEventListener('pointerup', pu); el.removeEventListener('pointercancel', pu)
    }
  }, [camera, gl])

  useFrame((_, dt) => {
    if (fly.current) return // still flying in
    const k = keys.current, l = look.current
    camera.rotation.set(l.pitch, l.yaw, 0)
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    if (!f && !s) return
    const prev = camera.position.clone()
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 14 : 4.5) * Math.min(dt, 0.1)
    const sin = Math.sin(l.yaw), cos = Math.cos(l.yaw)
    camera.position.x += (-sin * f + cos * s) * speed
    camera.position.z += (-cos * f - sin * s) * speed
    // stand on whatever is underfoot (deck, bascule, terrain); a ledge more than a metre up blocks the step
    const world = scene.getObjectByName('world')
    if (world) {
      ray.set(new Vector3(camera.position.x, camera.position.y - EYE + 1, camera.position.z), DOWN)
      const hit = ray.intersectObject(world, true).find((h) => h.object.visible && h.object.isMesh)
      if (hit) camera.position.y = hit.point.y + EYE
      else camera.position.copy(prev) // nothing underfoot: the edge of the world
    } else camera.position.y = EYE
  })
  return null
}
