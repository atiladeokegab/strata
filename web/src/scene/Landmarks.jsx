// The places around the bridge: parts with group "surroundings" in the place data, pinned where they stand
// (osgb -> scene frame from the terrain meta) and shown only in the years they exist. Tap a pin: select(id).
import { useEffect, useState } from 'react'
import { Html } from '@react-three/drei'
import { useStore } from '../store'

// terrain meta.json origin, used until the meta loads (scene frame: x east, y up, z south, y 0 = deck road level)
const META = { origin_osgb: [533670.3, 180265.1], origin_h: 13.47 }
const GROUND = -9 // pin foot, about street level below the deck
const TALL = { 'the-shard': 300, 'tower-of-london': 45, 'hms-belfast': 30 } // label height over the ground, m
const PIN = 40

export function Landmarks() {
  const parts = useStore((s) => s.place?.parts)
  const year = useStore((s) => s.year)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const [meta, setMeta] = useState(META)
  useEffect(() => {
    fetch('/terrain/tower-bridge/meta.json').then((r) => (r.ok ? r.json() : null)).then((m) => m?.origin_osgb && setMeta(m)).catch(() => {})
  }, [])
  const [oE, oN] = meta.origin_osgb
  const here = (parts || []).filter((p) => p.group === 'surroundings' && p.osgb
    && (p.years?.[0] == null || p.years[0] <= year) && (p.years?.[1] == null || year < p.years[1]))
  return (
    <group name="landmarks">
      {here.map((p) => {
        const h = TALL[p.id] ?? PIN
        const on = selected === p.id
        return (
          <group key={p.id} name={p.id} position={[p.osgb[0] - oE, GROUND, -(p.osgb[1] - oN)]}>
            <mesh position={[0, h / 2, 0]}>
              <cylinderGeometry args={[0.35, 0.35, h, 6]} />
              <meshBasicMaterial color={on ? '#ffd27a' : '#ffffff'} transparent opacity={on ? 0.95 : 0.55} depthWrite={false} />
            </mesh>
            <Html position={[0, h, 0]} center zIndexRange={[20, 0]}>
              <button type="button" onClick={(e) => { e.stopPropagation(); select(p.id) }}
                style={{
                  all: 'unset', cursor: 'pointer', whiteSpace: 'nowrap', font: '500 12px/1.2 Inter, system-ui, sans-serif',
                  padding: '4px 9px', borderRadius: 999, color: on ? '#1a1408' : '#fff',
                  background: on ? 'rgba(255,210,122,0.95)' : 'rgba(18,22,28,0.62)', backdropFilter: 'blur(6px)',
                  border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
                }}
                aria-label={`${p.name}: show its history`}>
                {p.name}
              </button>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

export default Landmarks
