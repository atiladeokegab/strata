// <Buildings />: the real buildings around Tower Bridge (Tower of London, City Hall, the Shard, Shad Thames,
// St Katharine Docks, the City towers), OpenStreetMap footprints extruded to LiDAR heights. Baked by
// scripts/buildings/bake.py. The always-works ground truth: shown whenever Google's photoreal tiles are not.
// Era: before 1950 only buildings with an OSM start_date of 1894 or earlier show; from 1950 a building shows once
// its start year has passed. Hidden ones collapse in the vertex shader, so scrubbing costs nothing.
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'

const URL = '/buildings/tower-bridge.json'
// the 1890s riverside, traced from the OS Town Plan 1893-96 (scripts/history/period_city.py); shown before 1950
const PERIOD_URL = '/buildings/tower-bridge-1890s.json'
// optional: Google's tile status, when build-google's files are in the build
const google = Object.values(import.meta.glob('./google/state.js', { eager: true }))[0]
const useGoogleShown = google?.useGoogleShown ?? (() => false)

let cache
const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${u}: ${r.status}`))))
const load = () => (cache ??= Promise.all([get(URL), get(PERIOD_URL).catch(() => null)]).then(([data, period]) => ({ ...data, period })))

function useBuildingsShown() {
  const lidar = useStore((s) => s.lidar)
  return !useGoogleShown(lidar) && !lidar // the LiDAR point cloud already holds every roof
}

// A facade texture tiled in metres (ExtrudeGeometry's side-wall uvs are world units).
function facade(draw, panel, floor) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  draw(g)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / panel, 1 / floor)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const FACADES = {
  // Portland stone: pale ashlar, tall dark sash windows
  s: () => facade((g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#4a4e52'; g.fillRect(20, 14, 24, 34); g.fillStyle = '#d6d2ca'; g.fillRect(0, 56, 64, 3) }, 3.6, 3.6),
  // London stock brick: smaller windows, a stone lintel
  b: () => facade((g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#3b3d40'; g.fillRect(22, 20, 20, 28); g.fillStyle = '#efe6d6'; g.fillRect(19, 15, 26, 5) }, 3.2, 3.2),
  // Victorian riverside warehouse: stock brick, small barred windows, a column of loading doors every bay
  w: () => facade((g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#2f2b28'; g.fillRect(8, 22, 14, 20); g.fillStyle = '#4a3020'; g.fillRect(40, 12, 18, 40); g.fillStyle = '#e4d8c4'; g.fillRect(0, 58, 64, 3) }, 5.0, 3.4),
  // curtain wall: floor slabs and mullions over glass
  g: () => facade((g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#4f5b63'; g.fillRect(0, 54, 64, 10); g.fillStyle = '#c9d2d8'; g.fillRect(0, 0, 3, 64) }, 1.6, 3.8),
}

const LOOK = {
  s: { color: '#d9d1bf', roughness: 0.86 },
  b: { color: '#b39270', roughness: 0.92 },
  g: { color: '#8ea2b0', roughness: 0.14, metalness: 0.55, envMapIntensity: 1.4 },
  w: { color: '#8f6f55', roughness: 0.95 }, // sooted London stock brick
  roof: { color: '#6b6862', roughness: 0.95 },
  slate: { color: '#4d5258', roughness: 0.8 }, // Welsh slate
  drape: { color: '#ffffff', roughness: 0.95 }, // roofs inside the LiDAR tile wear the terrain's aerial photo (or 1890s map)
}
const TERRAIN = '/terrain/tower-bridge/'
const HISTORIC_BEFORE = 1950 // the timeline's historic years, as in google/state.js
const BUILT_BY = 1894 // the bridge opened: a building dated after this has no place in the historic scene

// Era cut and contact shadow, injected into a stock material (and its shadow depth twin).
function eraPatch(uniforms, shade) {
  return (sh) => {
    sh.uniforms.uYear = uniforms.uYear
    sh.vertexShader = 'attribute float aStart;\nattribute float aEnd;\nattribute float aBase;\nuniform float uYear;\nvarying float vUp;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvUp = position.y - aBase;\nif (aStart > uYear || aEnd <= uYear) transformed = vec3(0.0);',
    )
    if (shade) {
      sh.fragmentShader = 'varying float vUp;\n' + sh.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.58, 1.0, smoothstep(0.0, 10.0, vUp));', // darker where the street meets the wall
      )
    }
  }
}

// One mesh per look: footprints -> extruded walls + roofs, packed into four big geometries.
function build(data) {
  const out = { s: newBucket(), b: newBucket(), g: newBucket(), w: newBucket(), roof: newBucket(), slate: newBucket(), drape: newBucket() }
  // the terrain's uv mapping (Terrain.jsx grid): u east across the tile, v = 1 at its north edge
  const [minE, minN, maxE, maxN] = data.frame.bbox_osgb
  const [oE, oN] = data.frame.origin_osgb
  const tileUv = (x, z) => [(x + oE - minE) / (maxE - minE), 1 - (z - oN + maxN) / (maxN - minN)]
  for (const bd of data.buildings) {
    const geo = extrude(bd)
    // before 1950 only buildings with evidence of standing by 1894 (OSM start_date) show; the LiDAR relief carries the rest
    const start = bd.s != null && bd.s <= BUILT_BY ? bd.s : Math.max(bd.s ?? HISTORIC_BEFORE, HISTORIC_BEFORE)
    for (const grp of geo.groups) {
      if (grp.materialIndex !== 0) push(out[bd.k] || out.b, geo, grp, start, bd.b)
      else if (bd.l) push(out.drape, geo, grp, start, bd.b, tileUv)
      else push(out.roof, geo, grp, start, bd.b)
    }
    geo.dispose()
  }
  // the 1890s riverside: from before the bridge until 1950, brick walls under slate (period_city.py)
  data.period?.buildings.forEach((bd, i) => {
    const geo = extrude(bd)
    const tint = TINTS[bd.k === 'w' ? 'w' : 'b'][(i * 7919) % 5] // a stable mix of brick and stucco, house by house
    for (const grp of geo.groups) {
      if (grp.materialIndex !== 0) push(out[bd.k] || out.b, geo, grp, PERIOD_FROM, bd.b, null, bd.e ?? HISTORIC_BEFORE, tint)
      else push(out.slate, geo, grp, PERIOD_FROM, bd.b, null, bd.e ?? HISTORIC_BEFORE, SLATE[i % 3])
    }
    geo.dispose()
  })
  return Object.fromEntries(Object.entries(out).map(([k, b]) => [k, toGeometry(b)]))
}

// multipliers on the facade colour: yellow London stock, sooted stock, red brick, painted stucco (houses only)
const TINTS = {
  w: [[1, 1, 1], [0.82, 0.8, 0.78], [1.08, 0.86, 0.74], [0.9, 0.86, 0.8], [1.05, 1.0, 0.92]],
  b: [[1.12, 1.08, 1.0], [0.86, 0.84, 0.82], [1.1, 0.82, 0.7], [1.38, 1.4, 1.42], [1.0, 0.96, 0.9]],
}
const SLATE = [[1, 1, 1], [0.86, 0.88, 0.92], [1.12, 1.06, 1.0]]
const WHITE = [1, 1, 1]
const PERIOD_FROM = 1066 // before the timeline starts: the period city stands from the first year shown

function extrude(bd) {
  const ring = (flat) => { const p = []; for (let i = 0; i < flat.length; i += 2) p.push(new THREE.Vector2(flat[i], -flat[i + 1])); return p }
  const shape = new THREE.Shape(ring(bd.o))
  for (const h of bd.h || []) shape.holes.push(new THREE.Path(ring(h)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: bd.t - bd.b, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2) // shape (x, -z) extruded along +y
  geo.translate(0, bd.b, 0)
  return geo
}

const newBucket = () => ({ pos: [], nor: [], uv: [], col: [], start: [], end: [], base: [] })

function push(b, geo, { start, count }, year, base, uvAt, end = 1e4, tint = WHITE) {
  const { position, normal, uv } = geo.attributes
  for (let i = start; i < start + count; i++) {
    b.pos.push(position.getX(i), position.getY(i), position.getZ(i))
    b.nor.push(normal.getX(i), normal.getY(i), normal.getZ(i))
    b.uv.push(...(uvAt ? uvAt(position.getX(i), position.getZ(i)) : [uv.getX(i), uv.getY(i)]))
    b.col.push(...tint)
    b.start.push(year)
    b.end.push(end)
    b.base.push(base)
  }
}

function toGeometry(b) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3))
  g.setAttribute('aStart', new THREE.Float32BufferAttribute(b.start, 1))
  g.setAttribute('aEnd', new THREE.Float32BufferAttribute(b.end, 1))
  g.setAttribute('aBase', new THREE.Float32BufferAttribute(b.base, 1))
  g.computeBoundingSphere()
  return g
}

export function Buildings() {
  const shown = useBuildingsShown()
  const year = useStore((s) => s.year)
  const [data, setData] = useState(null)
  useEffect(() => { load().then(setData, (e) => console.warn('[strata] buildings:', e)) }, [])

  const uniforms = useMemo(() => ({ uYear: { value: year } }), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { uniforms.uYear.value = year }, [uniforms, year])

  // both up front, like Terrain.jsx, so a year scrub swaps without a blank frame
  const photos = useMemo(() => ['color.jpg', 'color-1890s.jpg'].map((f) => {
    const t = new THREE.TextureLoader().load(TERRAIN + f)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }), [])
  useEffect(() => () => photos.forEach((t) => t.dispose()), [photos])
  const photo = photos[year < 1950 ? 1 : 0] // before 1950 the ground is the OS 1893-96 town plan

  const meshes = useMemo(() => {
    if (!data) return null
    const geos = build(data)
    return Object.entries(geos).map(([k, geometry]) => {
      const map = k === 'drape' ? photos[0] : FACADES[k]?.()
      const material = new THREE.MeshStandardMaterial({ ...LOOK[k], ...(map && { map }), vertexColors: true })
      material.onBeforeCompile = eraPatch(uniforms, true)
      material.customProgramCacheKey = () => 'strata-era'
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
      depth.onBeforeCompile = eraPatch(uniforms, false)
      return { k, geometry, material, depth }
    })
  }, [data, uniforms, photos])

  useEffect(() => { const m = meshes?.find((m) => m.k === 'drape'); if (m) m.material.map = photo }, [meshes, photo])
  useEffect(() => () => meshes?.forEach((m) => { m.geometry.dispose(); if (m.k !== 'drape') m.material.map?.dispose(); m.material.dispose(); m.depth.dispose() }), [meshes])

  if (!meshes) return null
  return (
    <group name="osm-buildings" rotation-y={THREE.MathUtils.degToRad(data.frame.axis_deg)} visible={shown}>
      {meshes.map((m) => (
        <mesh key={m.k} geometry={m.geometry} material={m.material} customDepthMaterial={m.depth} castShadow receiveShadow raycast={() => null} />
      ))}
    </group>
  )
}

// ODbL attribution, on screen whenever the buildings are.
export function BuildingsCredit() {
  return useBuildingsShown() ? <span className="osm-credit"> · Buildings © OpenStreetMap contributors</span> : null
}

export default Buildings
