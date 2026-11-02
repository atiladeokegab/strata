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
  c.width = c.height = 128 // drawn on a 64 grid at 2x: crisp on a wall beside the camera
  const g = c.getContext('2d')
  g.scale(2, 2)
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
  // Victorian riverside warehouse: stock brick, three small windows, then a column of timber loading doors, one per
  // floor on a stone sill, stacked up the front every 12 m
  w: () => facade((g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#2f2b28'; for (const x of [4, 15, 26]) g.fillRect(x, 20, 6, 24); g.fillStyle = '#6e5848'; g.fillRect(41, 0, 14, 58); g.fillStyle = '#e8dcc4'; g.fillRect(38, 58, 20, 5) }, 12, 3.8),
  // curtain wall: floor slabs and mullions over glass
  g: () => facade((g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#4f5b63'; g.fillRect(0, 54, 64, 10); g.fillStyle = '#c9d2d8'; g.fillRect(0, 0, 3, 64) }, 1.6, 3.8),
  // Kentish ragstone (the Tower of London): rough courses and, one bay in four, a narrow slit; a wall, not a terrace
  k: () => facade((g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#e4e0d8'; for (let y = 3; y < 64; y += 8) g.fillRect(0, y, 64, 1); g.fillStyle = '#3a3835'; g.fillRect(30, 26, 4, 12) }, 16, 9),
}

const LOOK = {
  s: { color: '#d9d1bf', roughness: 0.86 },
  b: { color: '#b39270', roughness: 0.92 },
  g: { color: '#8ea2b0', roughness: 0.14, metalness: 0.55, envMapIntensity: 1.4 },
  w: { color: '#7a6a5c', roughness: 0.95 }, // sooted London stock brick: dark grey-brown, not sand, not olive in shade
  k: { color: '#8c8476', roughness: 0.97 }, // Kentish ragstone, grey-brown
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
// round (wiki-tower-of-london). Sizes are illustrative: about 7 m across, 7 m above the parapet, a 5 m ogee cupola.
const OGEE = [[1, 0], [1.02, 0.12], [0.92, 0.3], [0.7, 0.48], [0.42, 0.64], [0.22, 0.8], [0.1, 0.92], [0, 1]] // (radius, height) fractions
function turrets(bd) {
  const xs = bd.o.filter((_, i) => i % 2 === 0), zs = bd.o.filter((_, i) => i % 2 === 1)
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  const walls = [], caps = []
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
    const cx = x + (x === x0 ? 3.5 : -3.5), cz = z + (z === z0 ? 3.5 : -3.5)
    const round = x === x1 && z === z0 // grid z runs south: z0 is the north side
    const w = round ? new THREE.CylinderGeometry(4, 4, 11, 12, 1, true) : new THREE.BoxGeometry(7, 11, 7)
    walls.push(w.toNonIndexed().translate(cx, bd.t + 1.5, cz))
    const r = round ? 4.4 : 5
    caps.push(new THREE.LatheGeometry(OGEE.map(([a, b]) => new THREE.Vector2(a * r, b * 5)), 12).toNonIndexed().translate(cx, bd.t + 7, cz))
    w.dispose()
  }
  return { walls, caps }
}

// The Royal Mint (Smirke, 1805-09, OSM w53866192): a pale stone block under lead, with a central gable across it whose
// west end is the pediment over the front on Tower Hill. Its span is where the footprint's mid-line crosses the walls;
// 22 m wide and 4.5 m high are illustrative.
const MINT = 'w53866192'
const PLA = 'r1020011' // 10 Trinity Square, 1922: period_city.py landmarks()
function pediment(bd) {
  const n = bd.o.length / 2, zs = bd.o.filter((_, i) => i % 2 === 1), zc = (Math.min(...zs) + Math.max(...zs)) / 2, xs = []
  for (let i = 0; i < n; i++) {
    const [ax, az, bx, bz] = [bd.o[2 * i], bd.o[2 * i + 1], bd.o[(2 * i + 2) % (2 * n)], bd.o[(2 * i + 3) % (2 * n)]]
    if ((az - zc) * (bz - zc) < 0) xs.push(ax + ((zc - az) / (bz - az)) * (bx - ax))
  }
  const [x0, x1, y, w, h] = [Math.min(...xs), Math.max(...xs), bd.t, 11, 4.5]
  const v = (x, dy, dz) => new THREE.Vector3(x, y + dy, zc + dz)
  const [a0, b0, p0, a1, b1, p1] = [v(x0, 0, -w), v(x0, 0, w), v(x0, h, 0), v(x1, 0, -w), v(x1, 0, w), v(x1, h, 0)]
  const mid = v((x0 + x1) / 2, h / 3, 0), e1 = new THREE.Vector3(), e2 = new THREE.Vector3()
  const geo = (tris) => { // wind every face outward from the prism's middle; flat normals, one uv (plain stone, plain lead)
    for (let i = 0; i < tris.length; i += 3) {
      if (e1.subVectors(tris[i + 1], tris[i]).cross(e2.subVectors(tris[i + 2], tris[i])).dot(e2.subVectors(tris[i], mid)) < 0) [tris[i + 1], tris[i + 2]] = [tris[i + 2], tris[i + 1]]
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((p) => [p.x, p.y, p.z]), 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(tris.length * 2).fill(0), 2))
    g.computeVertexNormals()
    return g
  }
  return { walls: [geo([a0, b0, p0, a1, b1, p1])], caps: [geo([a0, p0, p1, a0, p1, a1, b0, b1, p1, b0, p1, p0])] }
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
  for (const bd of [...data.buildings, ...(data.period?.landmarks ?? [])]) { // + multipolygons bake.py skips (period_city.py)
    if (onBridgeGround(bd.o, axis)) continue // the bridge draws its own towers, abutments, approaches and engine house
    if (LITE && beyond(bd, NEAR.osm) && bd.t - bd.b < SKYLINE) continue
    const geo = extrude(bd)
    // before 1950 only buildings with a real date show; the period city (below) carries the rest
    const date = data.dates[bd.id.split('-')[0]], dated = date?.s
    const tower = date?.src === 'wiki-tower-of-london' // ragstone under lead, not the drape: the 1890s map made white boxes
    // shortcut: a riverside warehouse is known by its OSM name (Butlers Wharf Buildings, Java Wharf); unnamed ones stay generic
    const wharf = bd.k !== 'g' && /wharf|warehouse|brewhouse/i.test(bd.n ?? '') && !/car park/i.test(bd.n)
    const pla = bd.id.startsWith(PLA) // sooted Portland stone with sash rows; its cornices in the plain coursed kit
    const wall = tower || (pla && bd.id.includes('cornice')) ? 'k' : pla ? 's' : wharf ? 'w' : bd.k, lead = tower || pla || wharf || bd.id === MINT // own roofs, not the photo
    if (wall === 'w') vary(geo, parseInt(bd.id.slice(1), 10) || 0)
    if (pla && wall === 's') stretch(geo, 0.6, 0.72, 0) // tall Beaux-Arts windows, wider bays than the kit's terrace sashes
    const s = dated ?? bd.s
    // shortcut: a real OSM start_date of exactly 1950 reads as bake.py's guess; none is known here
    const guess = dated == null && (s == null || s === TALL_GUESS)
    // the period city ends the plots under one built 1895-1949 (period_city.py); past its edge (FAR) nothing stands before 1950
    const start = !guess && s < HISTORIC_BEFORE ? (beyond(bd, FAR) && !pla ? HISTORIC_BEFORE : s)
      : guess && (bd.k === 'g' || (s === TALL_GUESS && bd.t - bd.b > 40)) ? GOOGLE_FROM
        : Math.max(s ?? HISTORIC_BEFORE, HISTORIC_BEFORE)
    const out = sets[start < HISTORIC_BEFORE ? 'o' : 'm']
    for (const grp of geo.groups) {
      if (grp.materialIndex !== 0) push(out[wall] || out.b, geo, grp, start, bd.b, null, 1e4, out === sets.m ? modernTint(bd, wall) : pla ? SOOT : WHITE)
      else if (bd.l && !lead) push(out.drape, geo, grp, start, bd.b, tileUv)
      else push(out.roof, geo, grp, start, bd.b)
    }
    geo.dispose()
    if (bd.id === WHITE_TOWER || bd.id === MINT) {
      const { walls, caps } = bd.id === MINT ? pediment(bd) : turrets(bd) // the pediment's stone ends, its lead slopes
      for (const [list, b] of [[walls, bd.id === MINT ? out.s : out.k], [caps, out.roof]]) {
        for (const g of list) { push(b, g, { start: 0, count: g.attributes.position.count }, start, bd.b); g.dispose() }
      }
    }
  }
  // the 1890s riverside: from before the bridge until 1950, brick walls under slate; the Blitz ends some in 1940
  // and leaves rubble ("r") and roofless wall stubs on their plots; 1939-45 adds sandbags and water tanks, tinted by "c" (period_city.py)
  data.period?.buildings.forEach((bd, i) => {
    if (onBridgeGround(bd.o, axis) || (LITE && beyond(bd, NEAR.period))) return
    const out = sets.p
    const geo = extrude(bd)
    if (bd.k === 'w') vary(geo, i)
    const tint = TINTS[bd.k === 'w' ? 'w' : 'b'][(i * 7919) % 5] // a stable mix of brick and stucco, house by house
    const from = bd.s ?? PERIOD_FROM, to = bd.e ?? HISTORIC_BEFORE
    for (const grp of geo.groups) {
      if (grp.materialIndex !== 0 || bd.s != null) push(out[bd.k] || out.b, geo, grp, from, bd.b, null, to, bd.c ?? (bd.k === 'r' ? WHITE : tint))
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
const FAR = 550 // m: the period city's edge (period_city.py FAR), where the ground fades into fog
const beyond = (bd, r) => { let x = 0, z = 0; const n = bd.o.length / 2; for (let i = 0; i < n; i++) { x += bd.o[2 * i]; z += bd.o[2 * i + 1] } return Math.hypot(x / n, z / n) > r }
const ERA_SHOWN = { o: () => true, p: (y) => y < HISTORIC_BEFORE, m: (y) => y >= HISTORIC_BEFORE }

// multipliers on the facade colour, soot-darkened: yellow London stock, grey soot, dull red brick, dirty stucco (houses only), dark stock
const TINTS = {
  w: [[1, 1, 1], [0.9, 0.87, 0.84], [0.98, 0.92, 0.86], [0.92, 0.9, 0.88], [1.08, 1.05, 1.0]], // close to Butler's Wharf
  b: [[0.84, 0.95, 1.0], [0.7, 0.72, 0.76], [0.78, 0.6, 0.64], [1.1, 1.29, 1.52], [0.72, 0.81, 0.89]],
}
// from 1950, OSM's undifferentiated stone and brick boxes: stock, red and grey brick; Portland, buff and fair-faced
// concrete; anything over 20 m concrete (the post-war slabs). Tints only, so no draw calls
const MODERN_TINTS = {
  b: [[1, 1, 1], [0.86, 0.92, 0.95], [0.66, 0.68, 0.72], [0.84, 0.55, 0.5], [0.6, 0.62, 0.66]],
  s: [[1, 1, 1], [0.95, 0.87, 0.74], [0.74, 0.77, 0.82], [0.58, 0.6, 0.64]],
}
const modernTint = (bd, wall) => {
  const t = MODERN_TINTS[wall], n = parseInt(bd.id.slice(1), 10) || 0
  return !t ? WHITE : wall === 's' && bd.t - bd.b > 20 ? t[2 + (n % 2)] : t[n % t.length]
}
const SOOT = [0.84, 0.82, 0.78] // Portland stone after fifty years of coal smoke
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

// A warehouse's own bay width, storey height and window scale on the shared kit (uv stretch, so no new draw calls):
// a row of them stops reading as one grid. Side-wall v runs 1 - height, so scale about 1 to keep the ground line.
function vary(geo, n) {
  const r = (k) => ((n * k) % 997) / 997
  stretch(geo, 0.75 + 0.55 * r(7919), 0.82 + 0.4 * r(104729), 12 * r(15485863))
}
function stretch(geo, su, sv, ou) {
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, 1 + (uv.getY(i) - 1) * sv)
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
