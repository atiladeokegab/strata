import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const HIGHLIGHT = new THREE.Color('#ffb547')
const tmp = new THREE.Vector3()
const DOWN = new THREE.Vector3(0, -1, 0)
const noRaycast = () => {}

// One clickable part. Every mesh inside is named by the part id (the shared key), gets its own
// material clones so highlight and x-ray never leak to other parts, and eases towards its
// exploded offset. `rt` holds the per-frame refs owned by TowerBridge.
// clipY (scene-local y) cuts the part off above that height, for parts rising during construction.
export function Part({ id, rt, home = [0, 0, 0], explode = [0, 0, 0], xray = false, clipY = null, children }) {
  const ref = useRef()
  const mats = useRef([])
  const meshes = useRef([])
  const fadeSel = useRef(0)
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0))

  useLayoutEffect(() => {
    const list = [], ms = []
    ref.current.traverse((o) => {
      o.name = id
      o.userData.partId = id
      if (!o.isMesh) return
      if (!o.userData.ownMat) {
        o.material = o.material.clone()
        o.userData.ownMat = true
      }
      list.push(o.material)
      ms.push(o)
    })
    mats.current = list
    meshes.current = ms
  })

  useFrame((_, dt) => {
    const g = ref.current
    const e = rt.explode.current
    tmp.set(home[0] + explode[0] * e, home[1] + explode[1] * e, home[2] + explode[2] * e)
    g.position.lerp(tmp, 1 - Math.exp(-dt * 6))
    const sel = rt.selected.current === id
    const hov = rt.hovered.current === id
    const glow = sel ? 0.45 : hov ? 0.2 : 0
    fadeSel.current += ((xray && rt.fades.current.includes(id) ? 1 : 0) - fadeSel.current) * (1 - Math.exp(-Math.min(dt, 0.1) * 3))
    const fade = xray ? Math.max(rt.explode.current, fadeSel.current) : 0
    // a see-through shell lets clicks through to what it contains
    for (const o of meshes.current) o.raycast = fade > 0.3 ? noRaycast : THREE.Mesh.prototype.raycast
    if (clipY !== null) plane.current.set(DOWN, clipY).applyMatrix4(rt.root.current.matrixWorld)
    const clip = clipY === null ? null : [plane.current]
    for (const m of mats.current) {
      m.emissive.copy(HIGHLIGHT)
      m.emissiveIntensity = glow
      if (m.userData.kind === 'steel') m.color.set(rt.steel.current)
      const t = fade > 0.01
      // three bakes `transparent` into the shader (OPAQUE define), so a flip needs a recompile.
      if (m.transparent !== t) (m.transparent = t), (m.needsUpdate = true)
      m.opacity = 1 - 0.7 * fade
      m.depthWrite = fade < 0.5
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
