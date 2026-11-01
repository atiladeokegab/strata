// Adapted from Mechanica (MIT), https://github.com/Caleb0796/mechanica
// DriveHandle (src/ui/viewer/DriveHandle.tsx) and DriveGizmo (src/ui/viewer/DriveGizmo.tsx), cut down
// to one joint: a bascule leaf turning about x at the pivot. Dragging the leaf moves the operator's
// lever (store.bascule); the hydraulic sim then moves the leaf. A tap still selects the part
// (Part's onClick), a drag does not.
import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../../store.js'
import { L } from './structures.jsx'
import { leverAfter, leverForKey, leverLabel } from './drive.js'

const pointerTapDistancePx = 5
const pointerTapDurationMs = 300
const LEAF = -L.pivotZ // pivot to the bascule tip, metres
const RADIUS = 4 // gizmo ring radius, metres

const isPointerTap = (intent, e) =>
  e.pointerId === intent.pointerId &&
  e.timeStamp - intent.startedAt < pointerTapDurationMs &&
  Math.hypot(e.clientX - intent.clientX, e.clientY - intent.clientY) < pointerTapDistancePx

const normalizeAngle = (d) => (d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d)

// Positive delta = rotation about the leaf's +x axis, which closes the leaf (PivotFrame uses -angle).
function drive(delta, maxAngle) {
  const s = useStore.getState()
  s.setBascule(leverAfter(s.bascule, delta, maxAngle))
}

// A drag is not a tap: eat the click the browser sends after pointerup, before R3F sees it, so
// neither the leaf nor whatever sits under the release point gets selected. A tap passes through.
function swallowNextClick() {
  const stop = (ev) => ev.stopPropagation()
  window.addEventListener('click', stop, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
}

// ---- DriveGizmo ----
const sharedClock = { value: 0 }
const ringGeometry = new THREE.TorusGeometry(1, 0.035, 12, 64)
const arrowGeometry = new THREE.ConeGeometry(0.075, 0.22, 16)
const colliderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false)
const colliderMaterial = new THREE.MeshBasicMaterial({ visible: false })

// Gizmo hits sort in front of the leaf so a grab near the ring always lands on the handle.
function raycastInFront(raycaster, intersections) {
  const first = intersections.length
  THREE.Mesh.prototype.raycast.call(this, raycaster, intersections)
  for (let i = first; i < intersections.length; i += 1) intersections[i].distance = 1e-6
}

const vertexShader = `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`
const fragmentShader = `
  uniform float uActive;
  uniform float uTime;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDirection)), 1.7);
    float phase = mod(uTime, 6.0);
    float pulse = smoothstep(0.0, 0.3, phase) * (1.0 - smoothstep(1.0, 1.8, phase));
    float restAlpha = pulse * (0.04 + fresnel * 0.18);
    float activeAlpha = 0.36 + fresnel * 0.58;
    float alpha = mix(restAlpha, activeAlpha, uActive);
    vec3 bronze = mix(vec3(0.69, 0.55, 0.34), vec3(1.0, 0.86, 0.45), fresnel);
    float emissive = mix(0.08 * pulse, 1.25, uActive);
    gl_FragColor = vec4(bronze * emissive, alpha);
  }
`
const gizmoMaterial = (active) =>
  new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    vertexShader,
    fragmentShader,
    uniforms: { uActive: { value: active ? 1 : 0 }, uTime: sharedClock },
  })
const activeMaterial = gizmoMaterial(true)
const restingMaterial = gizmoMaterial(false)

// Axis is x: the ring lies in the y-z plane; the cone (+y) points the way the tip lifts.
const ringQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
const colliderQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))
// Part skips meshes flagged `affordance` (no material clone, no highlight/x-ray).
const AFF = { affordance: true }

function DriveGizmo({ active, dragging }) {
  useFrame(({ clock }) => {
    sharedClock.value = clock.elapsedTime
  })
  const on = active || dragging
  return (
    <group visible={on}>
      <mesh frustumCulled={false} quaternion={ringQ} raycast={on ? raycastInFront : () => undefined} renderOrder={20} scale={RADIUS} userData={AFF}>
        <primitive attach="geometry" object={ringGeometry} />
        <primitive attach="material" object={on ? activeMaterial : restingMaterial} />
      </mesh>
      <mesh frustumCulled={false} position={[0, 0, RADIUS]} renderOrder={21} scale={RADIUS * 4} userData={AFF}>
        <primitive attach="geometry" object={arrowGeometry} />
        <primitive attach="material" object={activeMaterial} />
      </mesh>
      <mesh
        quaternion={colliderQ}
        raycast={on ? raycastInFront : () => undefined}
        scale={[RADIUS * 1.5, RADIUS * 0.6, RADIUS * 1.5]}
        userData={AFF}
      >
        <primitive attach="geometry" object={colliderGeometry} />
        <primitive attach="material" object={colliderMaterial} />
      </mesh>
    </group>
  )
}

// ---- DriveHandle ----
// Wrap a bascule's PivotFrame: <BasculeDrive sim={sim} side="north" maxAngle={rad}><S.PivotFrame .../></BasculeDrive>.
export function BasculeDrive({ sim, side, maxAngle, children }) {
  const lever = useStore((s) => s.bascule)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls)
  const root = useRef()
  const pivot = useRef()
  const tip = useRef()
  const activePointer = useRef(null)
  const intent = useRef(null)
  const activated = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const axisWorld = useRef(new THREE.Vector3())
  const centerWorld = useRef(new THREE.Vector3())
  const plane = useRef(new THREE.Plane())
  const hit = useRef(new THREE.Vector3())
  const lastRadial = useRef(new THREE.Vector3())
  const radial = useRef(new THREE.Vector3())
  const lastScreenAngle = useRef(0)
  const screenCenter = useRef({ x: 0, y: 0 })
  const useScreenArc = useRef(false)
  const useScreenY = useRef(false)
  const lastY = useRef(0)
  const height = useRef(1)

  // Mechanica turns orbit controls off for the length of a drag.
  useEffect(() => {
    if (!controls) return
    controls.enabled = !dragging
    return () => {
      controls.enabled = true
    }
  }, [controls, dragging])

  const stopWatching = useRef(null)
  useEffect(() => () => stopWatching.current?.(), [])

  useFrame(() => {
    tip.current.rotation.x = -sim.angle
  })

  const beginDrag = (e) => {
    // Only the first finger drives the lever; later fingers belong to the camera gesture.
    if (activePointer.current !== null || !e.nativeEvent.isPrimary) return
    // Only grab when the leaf (or gizmo) is the nearest thing hit, not through a tower in front.
    // Cars ride on the leaf, so look through traffic.
    let o = e.intersections.find((i) => i.object.name !== 'traffic')?.object
    while (o && o !== root.current) o = o.parent
    if (!o) return
    e.stopPropagation()
    activePointer.current = e.pointerId
    intent.current = { clientX: e.nativeEvent.clientX, clientY: e.nativeEvent.clientY, pointerId: e.pointerId, startedAt: e.nativeEvent.timeStamp }
    activated.current = false
    pivot.current.getWorldPosition(centerWorld.current)
    axisWorld.current.set(1, 0, 0).transformDirection(pivot.current.matrixWorld)
    // Unlike Mechanica's ring (centred on its joint), the leaf is grabbed anywhere along its 18 m
    // width: rotate in the plane through the grabbed point, about the pivot line.
    centerWorld.current.addScaledVector(axisWorld.current, axisWorld.current.dot(hit.current.copy(e.point).sub(centerWorld.current)))
    plane.current.setFromNormalAndCoplanarPoint(axisWorld.current, centerWorld.current)
    const rect = gl.domElement.getBoundingClientRect()
    const p = hit.current.copy(centerWorld.current).project(camera)
    screenCenter.current = { x: rect.left + (p.x + 1) * 0.5 * rect.width, y: rect.top + (1 - p.y) * 0.5 * rect.height }
    // Looking almost along the axis the plane is edge-on to the ray; fall back to a screen arc.
    const facing = Math.abs(e.ray.direction.dot(axisWorld.current))
    useScreenArc.current = facing > 0.92
    // Not in Mechanica: with the camera near the leaf's plane of rotation (end-on, top-down) the
    // ray barely crosses that plane, so map plain vertical drag to the lever instead.
    useScreenY.current = facing < 0.3
    lastY.current = e.nativeEvent.clientY
    height.current = rect.height
    if (!useScreenArc.current && !useScreenY.current) {
      const h = e.ray.intersectPlane(plane.current, hit.current)
      if (h) lastRadial.current.copy(h).sub(centerWorld.current).projectOnPlane(axisWorld.current)
      if (h && lastRadial.current.lengthSq() > 1e-8) lastRadial.current.normalize()
      else useScreenArc.current = true
    }
    if (useScreenArc.current) {
      lastScreenAngle.current = Math.atan2(e.nativeEvent.clientY - screenCenter.current.y, e.nativeEvent.clientX - screenCenter.current.x)
    }
    e.target.setPointerCapture(e.pointerId)
    if (controls) controls.enabled = false // now, not a render later, so the orbit never starts
    // A second finger means pinch or two-finger orbit, not a lever drag: drop the drag and hand the
    // camera back. Added now, not in an effect, so a quick second finger is not missed; window
    // capture runs before OrbitControls' canvas listener, so the controls see that finger.
    const onSecond = (ev) => {
      if (ev.pointerId === activePointer.current) return
      stopWatching.current?.()
      activePointer.current = null
      intent.current = null
      if (controls) controls.enabled = true
      setDragging(false)
    }
    window.addEventListener('pointerdown', onSecond, { capture: true })
    stopWatching.current = () => {
      window.removeEventListener('pointerdown', onSecond, { capture: true })
      stopWatching.current = null
    }
    setDragging(true)
  }

  const continueDrag = (e) => {
    if (activePointer.current !== e.pointerId) return
    e.stopPropagation()
    const n = e.nativeEvent
    if (!activated.current && Math.hypot(n.clientX - intent.current.clientX, n.clientY - intent.current.clientY) < pointerTapDistancePx) return
    activated.current = true
    let delta = 0
    if (useScreenY.current) {
      delta = ((n.clientY - lastY.current) / (height.current * 0.5)) * maxAngle
      lastY.current = n.clientY
    } else if (useScreenArc.current) {
      const angle = Math.atan2(n.clientY - screenCenter.current.y, n.clientX - screenCenter.current.x)
      const facing = Math.sign(e.ray.direction.dot(axisWorld.current)) || 1
      delta = -normalizeAngle(angle - lastScreenAngle.current) * facing
      lastScreenAngle.current = angle
    } else {
      const h = e.ray.intersectPlane(plane.current, hit.current)
      if (!h) return
      radial.current.copy(h).sub(centerWorld.current).projectOnPlane(axisWorld.current)
      if (radial.current.lengthSq() < 1e-8) return
      radial.current.normalize()
      delta = Math.atan2(axisWorld.current.dot(hit.current.crossVectors(lastRadial.current, radial.current)), lastRadial.current.dot(radial.current))
      lastRadial.current.copy(radial.current)
    }
    if (Number.isFinite(delta) && Math.abs(delta) > 1e-6) drive(delta, maxAngle)
  }

  const endDrag = (e) => {
    if (activePointer.current !== e.pointerId) return
    e.stopPropagation()
    if (!(intent.current && isPointerTap(intent.current, e.nativeEvent))) swallowNextClick()
    stopWatching.current?.()
    activePointer.current = null
    intent.current = null
    activated.current = false
    if (e.target.hasPointerCapture?.(e.pointerId)) e.target.releasePointerCapture(e.pointerId)
    setDragging(false)
  }

  const onKeyDown = (e) => {
    const next = leverForKey(e.key, useStore.getState().bascule, maxAngle)
    if (next === null) return
    e.preventDefault()
    useStore.getState().setBascule(next)
  }

  return (
    <group
      ref={root}
      onPointerDown={beginDrag}
      onPointerMove={continueDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {children}
      <group ref={pivot} position={[0, L.pivotY, L.pivotZ]}>
        <group ref={tip}>
          <group position={[0, -L.pivotY, LEAF]}>
            <DriveGizmo active={hovered} dragging={dragging} />
            <Html center zIndexRange={[10, 0]}>
              <button
                type="button"
                aria-label={leverLabel(side, lever)}
                onKeyDown={onKeyDown}
                style={{ position: 'absolute', width: 1, height: 1, padding: 0, overflow: 'hidden', clipPath: 'inset(50%)', border: 0 }}
              />
            </Html>
          </group>
        </group>
      </group>
    </group>
  )
}

export default BasculeDrive
