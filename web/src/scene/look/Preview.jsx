// Dev-only stand-in scene for tuning the look (open /look.html?cam=x,y,z&year=1900). Not imported by the app.
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useMemo } from 'react'
import { Look } from '../Look'
import { useStore } from '../../store'
import { pbr } from './textures'
import Terrain from '../Terrain'

const q = new URLSearchParams(location.search)
const cam = (q.get('cam') || '-180,60,160').split(',').map(Number)
const target = (q.get('target') || '0,20,0').split(',').map(Number)
if (q.get('year')) useStore.setState({ year: +q.get('year') })

function City() {
  const boxes = useMemo(() => {
    const out = []
    let s = 7
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let x = -700; x <= 700; x += 38)
      for (let z = -700; z <= 700; z += 38) {
        if (Math.abs(z) < 120) continue // the river
        if (rnd() < 0.25) continue
        const h = 8 + rnd() * rnd() * 60
        out.push([x + rnd() * 6, h / 2, z + rnd() * 6, 18 + rnd() * 14, h, 18 + rnd() * 14, rnd()])
      }
    return out
  }, [])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.5}><planeGeometry args={[1600, 1600]} /><meshStandardMaterial color="#7d8070" roughness={0.95} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.3}><planeGeometry args={[1600, 230]} /><meshStandardMaterial color="#3d4a50" roughness={0.08} metalness={0.2} transparent opacity={0.95} /></mesh>
      {boxes.map(([x, y, z, w, h, d, c], i) => (
        <mesh key={i} position={[x, y, z]}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color={c > 0.5 ? '#c9bfae' : '#a59c90'} roughness={0.85} /></mesh>
      ))}
      {[-60, 60].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position-y={32}><boxGeometry args={[18, 65, 22]} /><meshStandardMaterial {...pbr('stone:portland', 5)} /></mesh>
          <mesh position-y={71}><coneGeometry args={[9, 14, 4]} /><meshStandardMaterial {...pbr('slate:roof', 3)} /></mesh>
        </group>
      ))}
      <mesh position={[0, 42, 0]}><boxGeometry args={[110, 4, 6]} /><meshStandardMaterial {...pbr('steel:blue', 4)} /></mesh>
      <mesh position={[0, 0.5, 0]}><boxGeometry args={[260, 2, 14]} /><meshStandardMaterial color="#6f8fb0" roughness={0.35} metalness={0.7} /></mesh>
    </group>
  )
}

createRoot(document.getElementById('root')).render(
  <Canvas camera={{ position: cam, fov: 45, near: 0.5, far: 20000 }} gl={{ antialias: false }}>
    {q.get('terrain') ? <Terrain step={+q.get('terrain')} /> : <City />}
    <OrbitControls target={target} />
    <Look />
  </Canvas>,
)
