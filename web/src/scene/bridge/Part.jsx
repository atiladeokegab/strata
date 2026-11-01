import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clickThrough } from './xray.js'
import { roadSurface } from './roadway.js'
import { pbr } from '../look/textures.js'

const HIGHLIGHT = new THREE.Color('#ffb547')
const tmp = new THREE.Vector3()
const DOWN = new THREE.Vector3(0, -1, 0)

// One clickable part. Every mesh inside is named by the part id (the shared key), gets its own
// material clones so highlight and x-ray never leak to other parts, and eases towards its
// exploded offset. `rt` holds the per-frame refs owned by TowerBridge.
// clipY (scene-local y) cuts the part off above that height, for parts rising during construction.
export function Part({ id, rt, home = [0, 0, 0], explode = [0, 0, 0], xray = false, clipY = null, dim = 0, children }) {
  const ref = useRef()
  const mats = useRef([])
  const meshes = useRef([])
  const fadeSel = useRef(0)
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0))
  const clipList = useRef([plane.current])
  const last = useRef(null) // what the materials were last written with; null forces a write
  const roadWait = useRef(0) // frames since a road material was found without Look's maps yet

  useLayoutEffect(() => {
    const list = [], ms = []
    ref.current.traverse((o) => {
      o.name = id
      o.userData.partId = id
      if (!o.isMesh || o.userData.affordance) return // drive gizmos keep their own materials
      if (!o.userData.ownMat) {
        o.material = o.material.clone()
        o.userData.ownMat = true
      }
      list.push(o.material)
      ms.push(o)
    })
    mats.current = list
    meshes.current = ms
    last.current = null
  })

  useFrame((_, dt) => {
    // road surface waits for Look's maps: retry only the road materials, twice a second, not the whole pass
    if (roadWait.current && ++roadWait.current % 30 === 0)
      roadWait.current = mats.current.filter((m) => m.userData.kind === 'road' && !roadSurface(m, rt.road.current, pbr)).length ? 1 : 0
    const g = ref.current
    const e = rt.explode.current
    tmp.set(home[0] + explode[0] * e, home[1] + explode[1] * e, home[2] + explode[2] * e)
    g.position.lerp(tmp, 1 - Math.exp(-dt * 6))
    const sel = rt.selected.current === id
    const hov = rt.hovered.current === id
    const glow = sel ? 0.45 : hov ? 0.2 : 0
    fadeSel.current += ((xray && rt.fades.current.includes(id) ? 1 : 0) - fadeSel.current) * (1 - Math.exp(-Math.min(dt, 0.1) * 3))
    const shell = xray ? Math.max(rt.explode.current, fadeSel.current) : 0
    const fade = Math.max(shell, dim) // dim: fixed fade, e.g. a closed walkway
    if (clipY !== null) plane.current.set(DOWN, clipY).applyMatrix4(rt.root.current.matrixWorld)
    // Material writes only when something changed: most frames nothing does.
    const clip = clipY === null ? null : clipList.current
    const was = last.current
    if (was && was.glow === glow && was.fade === fade && was.shell === shell && was.steel === rt.steel.current && was.road === rt.road?.current && was.clip === clip) return
    last.current = { glow, fade, shell, steel: rt.steel.current, road: rt.road?.current, clip }
    // a see-through shell lets clicks through to what it contains; a dimmed part stays clickable
    for (const o of meshes.current) clickThrough(o, shell > 0.3)
    for (const m of mats.current) {
      m.emissive.copy(HIGHLIGHT)
      m.emissiveIntensity = glow
      if (m.userData.kind === 'steel') m.color.set(rt.steel.current)
      if (m.userData.kind === 'road' && rt.road && !roadSurface(m, rt.road.current, pbr)) roadWait.current ||= 1
      const own = m.userData.opacity ?? 1 // clear glass keeps its own opacity under the fade
      const t = fade > 0.01 || own < 1
      // three bakes `transparent` into the shader (OPAQUE define), so a flip needs a recompile.
      if (m.transparent !== t) (m.transparent = t), (m.needsUpdate = true)
      m.opacity = own * (1 - 0.7 * fade)
      m.depthWrite = own === 1 && fade < 0.5
      m.clippingPlanes = clip
    }
  })

  return (
    <group
      ref={ref}
      position={home}
      onClick={(e) => {
        e.stopPropagation()
        rt.select(id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        rt.hovered.current = id
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        if (rt.hovered.current === id) rt.hovered.current = null
        document.body.style.cursor = ''
      }}
    >
      {children}
    </group>
  )
}
