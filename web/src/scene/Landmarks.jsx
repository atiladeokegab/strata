// The places around the bridge, and the river's period moorings before 1950: parts with group "surroundings" in the place data, pinned where they stand
// (osgb -> scene frame from the terrain meta) and shown only in the years they exist. Tap a label: select(id). No pole: it read as a post in the river.
import { useEffect, useState } from 'react'
import { Html } from '@react-three/drei'
import { useStore } from '../store'
import { heightAt, loadTerrain } from './Terrain.jsx'
import { PeriodRiver } from './PeriodRiver.jsx'
import { Barrage } from './Barrage.jsx'

// terrain meta.json origin, used until the meta loads (scene frame: x east, y up, z south, y 0 = deck road level)
const META = { origin_osgb: [533670.3, 180265.1] }
const GROUND = -9 // pin foot, about street level below the deck
const TALL = { 'the-shard': 300, 'tower-of-london': 45, 'hms-belfast': 30 } // label height over the ground, m
const PIN = 40

export function Landmarks() {
  const parts = useStore((s) => s.place?.parts)
  const year = useStore((s) => s.year)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const [terrain, setTerrain] = useState(null)
  useEffect(() => { loadTerrain().then(setTerrain).catch(() => {}) }, [])
  const [oE, oN] = (terrain?.meta ?? META).origin_osgb
  const here = (parts || []).filter((p) => p.group === 'surroundings' && p.osgb
    && (p.years?.[0] == null || p.years[0] <= year) && (p.years?.[1] == null || year < p.years[1]))
  return (
    <group name="landmarks">
      {year < 1950 && <PeriodRiver terrain={terrain} />}
      {terrain && year >= 1939 && year <= 1945 && <Barrage terrain={terrain} />}
      {here.map((p) => {
        const h = TALL[p.id] ?? PIN
        const on = selected === p.id
        const x = p.osgb[0] - oE, z = -(p.osgb[1] - oN)
        return (
          <group key={p.id} name={p.id} position={[x, (terrain && heightAt(terrain, x, z)) ?? GROUND, z]}>
            <Html position={[0, h, 0]} center zIndexRange={[20, 0]}>
              <button type="button" onClick={(e) => { e.stopPropagation(); select(p.id) }}
                style={{
                  all: 'unset', cursor: 'pointer', whiteSpace: 'nowrap', font: '500 12px/1.2 Inter, system-ui, sans-serif',
                  padding: '4px 10px', borderRadius: 999, color: on ? '#fff' : '#0d0d0d',
                  background: on ? '#0d0d0d' : 'rgba(255,255,255,0.78)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  border: `1px solid ${on ? '#0d0d0d' : 'rgba(0,0,0,0.08)'}`, boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.08)',
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
