// Adapted from Mechanica (MIT), src/ui/HomeCarouselHero.tsx: the warm museum light rig, light pool,
// round plinth and slow turntable drift, reduced to one place.
// <Home onEnter={fn} />: the landing stage, "a museum of places". Tower Bridge turns under a spotlight.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ACESFilmicToneMapping, CanvasTexture, SRGBColorSpace } from 'three'
import { makeSlot } from '../slots'
import { startTour } from '../../tour/tour.js'
import { BridgeStandIn } from '../StandIns'
import { pbr } from '../../scene/look/textures'
import './home.css'

const TowerBridge = makeSlot('TowerBridge', ['../scene/bridge/TowerBridge.jsx', '../scene/bridge/index.jsx'], BridgeStandIn)

const PLINTH_R = 150 // metres, in the bridge's own frame: it is 277 m end to end
const SCALE = 1.4
const PLINTH_TOP = -9 // Thames high water, so the piers sink into the plinth

const NEXT = [
  { name: 'Stonehenge', line: 'Lidar picks out the barrows, the Avenue and the Cursus around the stones, earthworks you cannot see on the ground.' },
  { name: "Hadrian's Wall", line: 'Where the stone was robbed away, lidar still traces the Vallum ditch and the line of the wall across the fells.' },
  { name: 'The Tower of London', line: 'Lidar shows the drained moat and the concentric curtain walls in relief around the White Tower.' },
]

const useMedia = (q) => {
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}

const useVisible = () => {
  const [v, setV] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const on = () => setV(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return v
}

function LightPool() {
  const map = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    r.addColorStop(0, 'rgba(255, 236, 200, 0.34)')
    r.addColorStop(0.45, 'rgba(255, 214, 150, 0.14)')
    r.addColorStop(0.8, 'rgba(230, 170, 90, 0.03)')
    r.addColorStop(1, 'rgba(200, 140, 70, 0)')
    g.fillStyle = r
    g.fillRect(0, 0, 256, 256)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => map.dispose(), [map])
  return (
    <mesh position={[0, PLINTH_TOP + 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <circleGeometry args={[PLINTH_R * SCALE * 1.4, 64]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function Plinth() {
  return (
    <group>
      <mesh position={[0, PLINTH_TOP - 6, 0]}>
        <cylinderGeometry args={[PLINTH_R, PLINTH_R, 12, 96]} />
        <meshStandardMaterial {...pbr('wood:dark', 3)} />
      </mesh>
      <mesh position={[0, PLINTH_TOP + 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[PLINTH_R * 0.93, PLINTH_R * 0.935, 96]} />
        <meshBasicMaterial color="#c88a42" toneMapped={false} />
      </mesh>
    </group>
  )
}

function WarmLightRig() {
  const light = useRef(null)
  const target = useRef(null)
  useLayoutEffect(() => { light.current.target = target.current }, [])
  return (
    <>
      {/* near-white key so Portland stone and blue steel keep their colours; the warmth is in the spot and rim */}
      <ambientLight color="#f2ead8" intensity={0.15} />
      <hemisphereLight args={['#f4f1ea', '#1d1813', 0.45]} />
      <directionalLight color="#fff6e8" intensity={1.5} position={[220, 320, 300]} />
      <directionalLight color="#c9935a" intensity={0.45} position={[-280, 140, -220]} />
      <spotLight ref={light} color="#ffd9a0" angle={0.42} penumbra={0.7} decay={0} intensity={2.6} position={[60, 620, 260]} />
      <group ref={target} position={[0, 10, 0]} />
    </>
  )
}

function Turntable({ still }) {
  const g = useRef(null)
  useFrame((_, dt) => { if (!still) g.current.rotation.y += Math.min(dt, 0.1) * 0.07 })
  return (
    <group ref={g} rotation={[0, -0.75, 0]} scale={SCALE}>
      <Plinth />
      <TowerBridge />
    </group>
  )
}

export default function Home({ onEnter }) {
  const still = useMedia('(prefers-reduced-motion: reduce)')
  const visible = useVisible()
  return (
    <section className="home" aria-label="Strata, a museum of places">
      <div className="home-stage" aria-hidden="true">
        <Canvas
          dpr={[1, 1.5]}
          frameloop={!visible ? 'never' : still ? 'demand' : 'always'}
          camera={{ fov: 30, position: [-70, 190, 760], near: 5, far: 5000 }}
          onCreated={({ camera }) => camera.lookAt(-70, 10, 0)}
          gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        >
          <color attach="background" args={['#f5f5f7']} />
          <fog attach="fog" args={['#f5f5f7', 900, 1700]} />
          <WarmLightRig />
          <LightPool />
          <Turntable still={still} />
        </Canvas>
      </div>
      <div className="home-copy">
        <p className="home-eyebrow">A museum of places</p>
        <h1 className="home-title">
          <span className="home-word">Strata</span>
          <span className="home-sub">History is text and flat photos. Strata lets visitors, students and teachers watch a landmark being built, from real LiDAR and sourced history.</span>
        </h1>
        <div className="home-actions">
          <button type="button" className="home-story" onClick={() => { onEnter(); startTour() }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>Play the 60 s story
          </button>
          <button type="button" className="home-enter" onClick={onEnter}>
            Enter Tower Bridge <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      <section className="home-next" aria-label="Coming next">
        <p className="home-next-label">Coming next</p>
        <ul>
          {NEXT.map((p) => (
            <li key={p.name} className="home-card">
              <strong>{p.name} <em className="soon">Soon</em></strong>
              <span>{p.line}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
