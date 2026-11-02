// Interiors draw only when you can see them. useNear(ref, pos, ids, r, h) is true while the camera is within
// r metres of pos (switching on inside r - h and off past r + h, so no flicker at the edge), in walk mode,
// exploded, or when one of ids is selected or x-rayed by a selection. ref is any mounted object in pos's
// frame: the test runs in its local metres, one per frame, and the hook re-renders only when the answer flips.
// r = 0 turns the distance test off (LITE keeps interiors hidden unless asked for).
import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../../store.js'
import { containersOf } from './xray.js'

const cam = new THREE.Vector3(), inv = new THREE.Matrix4(), at = new THREE.Vector3()

export const nearNow = (d, was, r, h) => r > 0 && d < (was ? r + h : r - h)

export function useNear(ref, pos, ids = [], r = 60, h = 5) {
  const camera = useThree((s) => s.camera)
  // no camera position (check.mjs's stub renderer): count the interiors as drawn, the worst case
  const [near, setNear] = useState(() => r > 0 && !camera?.position)
  const was = useRef(near)
  useFrame(() => {
    const o = ref.current
    if (!o) return
    cam.copy(camera.position).applyMatrix4(inv.copy(o.matrixWorld).invert())
    const n = nearNow(cam.distanceTo(at.set(...pos)), was.current, r, h)
    if (n !== was.current) setNear((was.current = n))
  })
  const walk = useStore((s) => s.view === 'walk')
  const exploded = useStore((s) => s.exploded)
  const hit = useStore((s) => s.selected != null && ids.some((id) => s.selected === id || containersOf(s.selected).includes(id)))
  return near || walk || exploded || hit
}
