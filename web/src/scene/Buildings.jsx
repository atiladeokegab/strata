// <Buildings />: the real buildings around Tower Bridge (Tower of London, City Hall, the Shard, Shad Thames,
// St Katharine Docks, the City towers), OpenStreetMap footprints extruded to LiDAR heights. Baked by
// scripts/buildings/bake.py. The always-works ground truth: shown whenever Google's photoreal tiles are not.
// Era: a building with a real date before 1950 shows from that year (one by 1894 from the start); from 1950 the rest
// show once their start year has passed, until Google's tiles take over (GOOGLE_FROM). Dates: OSM start_date, else
// tower-bridge-dates.json (Wikidata, the Tower of London precinct, HMS Belfast: scripts/history/modern_dates.py); an
// undated building over 40 m (bake.py's 1950 guess) waits for the tiles, as does undated glass (Tower Bridge House is
// no 1971 building). Hidden ones collapse in the vertex shader, so scrubbing costs nothing.
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { onBridgeGround } from './bareEarth.js'
import { LITE } from './look/tier'

const URL = '/buildings/tower-bridge.json'
// the 1890s riverside, traced from the OS Town Plan 1893-96 (scripts/history/period_city.py); shown before 1950
const PERIOD_URL = '/buildings/tower-bridge-1890s.json'
const DATES_URL = '/buildings/tower-bridge-dates.json'
// optional: Google's tile status, when build-google's files are in the build
const google = Object.values(import.meta.glob('./google/state.js', { eager: true }))[0]
const useGoogleShown = google?.useGoogleShown ?? (() => false)
const GOOGLE_FROM = google?.GOOGLE_FROM ?? 1e4

let cache
const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${u}: ${r.status}`))))
const load = () => (cache ??= Promise.all([get(URL), get(PERIOD_URL).catch(() => null), get(DATES_URL).catch(() => null)])
  .then(([data, period, dates]) => ({ ...data, period, dates: dates?.dates ?? {} })))

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
  // Kentish ragstone (the Tower of London): rough courses, a narrow window or slit now and then
  k: () => facade((g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#e2ddd3'; for (let y = 6; y < 64; y += 14) g.fillRect(0, y, 64, 2); g.fillStyle = '#34322f'; g.fillRect(29, 20, 7, 24) }, 4.5, 4.5),
}

const LOOK = {
  s: { color: '#d9d1bf', roughness: 0.86 },
  b: { color: '#b39270', roughness: 0.92 },
  g: { color: '#8ea2b0', roughness: 0.14, metalness: 0.55, envMapIntensity: 1.4 },
  w: { color: '#7f7464', roughness: 0.95 }, // sooted London stock brick: dull grey-yellow, not orange
  k: { color: '#a39886', roughness: 0.97 }, // Kentish ragstone, grey-buff
  roof: { color: '#6b6862', roughness: 0.95 },
  slate: { color: '#4d5258', roughness: 0.8 }, // Welsh slate
  r: { color: '#8b6f58', roughness: 1 }, // Blitz rubble: brick dust and charred timber, 1940-1950
  drape: { color: '#ffffff', roughness: 0.95 }, // roofs inside the LiDAR tile wear the terrain's aerial photo (or 1890s map)
}
const TERRAIN = '/terrain/tower-bridge/'
const HISTORIC_BEFORE = 1950 // the timeline's historic years, as in google/state.js
const TALL_GUESS = 1950 // bake.py's start for an undated building over 40 m
const WHITE_TOWER = 'w369135772' // OSM way, as in modern_dates.py

// The White Tower's four corner turrets over its footprint's bounds, each with a lead cupola; the north-east one is
// round (wiki-tower-of-london). Sizes are illustrative: about 7 m across, 7 m above the parapet, a 5 m cupola.
function turrets(bd) {
  const xs = bd.o.filter((_, i) => i % 2 === 0), zs = bd.o.filter((_, i) => i % 2 === 1)
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  const walls = [], caps = []
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
    const cx = x + (x === x0 ? 3.5 : -3.5), cz = z + (z === z0 ? 3.5 : -3.5)
    const round = x === x1 && z === z0 // grid z runs south: z0 is the north side
    const w = round ? new THREE.CylinderGeometry(4, 4, 11, 12, 1, true) : new THREE.BoxGeometry(7, 11, 7)
    walls.push(w.toNonIndexed().translate(cx, bd.t + 1.5, cz))
    caps.push(new THREE.ConeGeometry(round ? 4.4 : 5, 5, 8).toNonIndexed().translate(cx, bd.t + 9.5, cz))
    w.dispose()
  }
  return { walls, caps }
}

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
  // one set of looks per era, so a year draws only its own: o = standing by 1894 (always), p = the 1890s city (to 1950), m = modern
  const looks = () => ({ s: newBucket(), b: newBucket(), g: newBucket(), w: newBucket(), k: newBucket(), r: newBucket(), roof: newBucket(), slate: newBucket(), drape: newBucket() })
  const sets = { o: looks(), p: looks(), m: looks() }
  // the terrain's uv mapping (Terrain.jsx grid): u east across the tile, v = 1 at its north edge
  const [minE, minN, maxE, maxN] = data.frame.bbox_osgb
  const [oE, oN] = data.frame.origin_osgb
  const tileUv = (x, z) => [(x + oE - minE) / (maxE - minE), 1 - (z - oN + maxN) / (maxN - minN)]
  const axis = data.frame.axis_deg
  for (const bd of data.buildings) {
    if (onBridgeGround(bd.o, axis)) continue // the bridge draws its own towers, abutments, approaches and engine house
    if (LITE && beyond(bd, NEAR.osm) && bd.t - bd.b < SKYLINE) continue
    const geo = extrude(bd)
    // before 1950 only buildings with a real date show; the period city (below) carries the rest
    const date = data.dates[bd.id.split('-')[0]], dated = date?.s
    const tower = date?.src === 'wiki-tower-of-london' // ragstone under lead, not the drape: the 1890s map made white boxes
    const s = dated ?? bd.s
    // shortcut: a real OSM start_date of exactly 1950 reads as bake.py's guess; none is known here
    const guess = dated == null && (s == null || s === TALL_GUESS)
    const start = !guess && s < HISTORIC_BEFORE ? s // the period city ends the plots under one built 1895-1949 (period_city.py)
      : guess && (bd.k === 'g' || (s === TALL_GUESS && bd.t - bd.b > 40)) ? GOOGLE_FROM
        : Math.max(s ?? HISTORIC_BEFORE, HISTORIC_BEFORE)
    const out = sets[start < HISTORIC_BEFORE ? 'o' : 'm']
    for (const grp of geo.groups) {
      if (grp.materialIndex !== 0) push(out[tower ? 'k' : bd.k] || out.b, geo, grp, start, bd.b)
      else if (bd.l && !tower) push(out.drape, geo, grp, start, bd.b, tileUv)
      else push(out.roof, geo, grp, start, bd.b)
    }
    geo.dispose()
    if (bd.id === WHITE_TOWER) {
      const { walls, caps } = turrets(bd)
      for (const [list, b] of [[walls, out.k], [caps, out.roof]]) {
        for (const g of list) { push(b, g, { start: 0, count: g.attributes.position.count }, start, bd.b); g.dispose() }
      }
    }
  }
  // the 1890s riverside: from before the bridge until 1950, brick walls under slate; the Blitz ends some in 1940
  // and leaves rubble ("r") and roofless wall stubs on their plots (period_city.py)
  data.period?.buildings.forEach((bd, i) => {
    if (onBridgeGround(bd.o, axis) || (LITE && beyond(bd, NEAR.period))) return
    const out = sets.p
    const geo = extrude(bd)
    const tint = TINTS[bd.k === 'w' ? 'w' : 'b'][(i * 7919) % 5] // a stable mix of brick and stucco, house by house
    const from = bd.s ?? PERIOD_FROM, to = bd.e ?? HISTORIC_BEFORE
    for (const grp of geo.groups) {
      if (grp.materialIndex !== 0 || bd.s != null) push(out[bd.k] || out.b, geo, grp, from, bd.b, null, to, bd.k === 'r' ? WHITE : tint)
      else push(out.slate, geo, grp, from, bd.b, null, to, SLATE[i % 3])
    }
    geo.dispose()
    if (bd.p) {
      const roof = hipRoof(bd.p, bd.t, bd.k === 'w' ? 0.35 : 0.7)
      push(out.slate, roof, { start: 0, count: roof.attributes.position.count }, from, bd.b, null, to, SLATE[i % 3])
      roof.dispose()
    }
  })
  return Object.entries(sets).flatMap(([era, set]) => Object.entries(set).filter(([, b]) => b.pos.length).map(([look, b]) => ({ era, look, geometry: toGeometry(b) })))
}

// lite: the city within these radii of the bridge (m), plus the skyline; 1890 ~45k triangles instead of ~150k
const NEAR = { osm: 700, period: 500 }, SKYLINE = 60
const beyond = (bd, r) => { let x = 0, z = 0; const n = bd.o.length / 2; for (let i = 0; i < n; i++) { x += bd.o[2 * i]; z += bd.o[2 * i + 1] } return Math.hypot(x / n, z / n) > r }
const ERA_SHOWN = { o: () => true, p: (y) => y < HISTORIC_BEFORE, m: (y) => y >= HISTORIC_BEFORE }

// multipliers on the facade colour, soot-darkened: yellow London stock, grey soot, dull red brick, dirty stucco (houses only), dark stock
const TINTS = {
  w: [[1, 1, 1], [0.85, 0.86, 0.9], [1.1, 0.85, 0.8], [0.92, 0.9, 0.88], [1.08, 1.05, 1.0]],
  b: [[0.84, 0.95, 1.0], [0.64, 0.75, 0.93], [0.78, 0.6, 0.64], [1.1, 1.29, 1.52], [0.72, 0.81, 0.89]],
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

// A hipped roof over a footprint's minimum rectangle (corners [x0,z0, .. x3,z3]), ridge along the long side, rising
// pitch x half the short side (0.7 is about 35 degrees, slate's usual; warehouses sit lower), at most 3.5 m so a big plot is not a
// pyramid (a real deep plot has several ridges). The flat cap stays under it.
function hipRoof(p, y, pitch) {
  const c = [0, 2, 4, 6].map((k) => new THREE.Vector3(p[k], y, p[k + 1]))
  if (c[0].distanceTo(c[1]) < c[1].distanceTo(c[2])) c.push(c.shift()) // c0-c1 is a long side
  const long = c[0].distanceTo(c[1]), half = c[1].distanceTo(c[2]) / 2
  const mid = c[0].clone().add(c[2]).multiplyScalar(0.5).setY(y + Math.min(half * pitch, 3.5))
  const along = c[1].clone().sub(c[0]).normalize().multiplyScalar(Math.max(long / 2 - half, 0))
  const r0 = mid.clone().sub(along), r1 = mid.clone().add(along)
  const tris = [c[0], c[1], r1, c[0], r1, r0, c[1], c[2], r1, c[2], c[3], r0, c[2], r0, r1, c[3], c[0], r0]
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3()
  for (let i = 0; i < tris.length; i += 3) { // wind every face up (counter-clockwise from above), whichever way the corners run
    if (e1.subVectors(tris[i + 1], tris[i]).cross(e2.subVectors(tris[i + 2], tris[i])).y < 0) [tris[i + 1], tris[i + 2]] = [tris[i + 2], tris[i + 1]]
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((v) => [v.x, v.y, v.z]), 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(tris.flatMap((v) => [v.x, v.z]), 2))
  g.computeVertexNormals() // non-indexed: flat per face
  return g
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
    return build(data).map(({ era, look, geometry }) => {
      const k = `${era}.${look}`
      const map = look === 'drape' ? photos[0] : FACADES[look]?.()
      const material = new THREE.MeshStandardMaterial({ ...LOOK[look], ...(map && { map }), vertexColors: true })
      material.onBeforeCompile = eraPatch(uniforms, true)
      material.customProgramCacheKey = () => 'strata-era'
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
      depth.onBeforeCompile = eraPatch(uniforms, false)
      return { k, era, look, geometry, material, depth }
    })
  }, [data, uniforms, photos])

  useEffect(() => { meshes?.filter((m) => m.look === 'drape').forEach((m) => { m.material.map = photo }) }, [meshes, photo])
  useEffect(() => () => meshes?.forEach((m) => { m.geometry.dispose(); if (m.look !== 'drape') m.material.map?.dispose(); m.material.dispose(); m.depth.dispose() }), [meshes])

  if (!meshes) return null
  return (
    <group name="osm-buildings" rotation-y={THREE.MathUtils.degToRad(data.frame.axis_deg)} visible={shown}>
      {meshes.map((m) => (
        <mesh key={m.k} visible={ERA_SHOWN[m.era](year)} geometry={m.geometry} material={m.material} customDepthMaterial={m.depth} castShadow receiveShadow raycast={() => null} />
      ))}
    </group>
  )
}

// ODbL attribution, on screen whenever the buildings are.
export function BuildingsCredit() {
  return useBuildingsShown() ? <span className="osm-credit"> · Buildings © OpenStreetMap contributors</span> : null
}

export default Buildings
