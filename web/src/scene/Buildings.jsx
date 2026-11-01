// <Buildings />: the real buildings around Tower Bridge (Tower of London, City Hall, the Shard, Shad Thames,
// St Katharine Docks, the City towers), OpenStreetMap footprints extruded to LiDAR heights. Baked by
// scripts/buildings/bake.py. The always-works ground truth: shown whenever Google's photoreal tiles are not.
// Era: a building whose start year (OSM start_date, or 1950 for an undated tower over 40 m) is after the
// timeline year is collapsed in the vertex shader, so scrubbing costs nothing.
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'

const URL = '/buildings/tower-bridge.json'
// optional: Google's tile status, when build-google's files are in the build
const google = Object.values(import.meta.glob('./google/state.js', { eager: true }))[0]
const useGoogleShown = google?.useGoogleShown ?? (() => false)

let cache
const load = () => (cache ??= fetch(URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${URL}: ${r.status}`)))))

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
  // curtain wall: floor slabs and mullions over glass
  g: () => facade((g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#4f5b63'; g.fillRect(0, 54, 64, 10); g.fillStyle = '#c9d2d8'; g.fillRect(0, 0, 3, 64) }, 1.6, 3.8),
}

const LOOK = {
  s: { color: '#d9d1bf', roughness: 0.86 },
  b: { color: '#b39270', roughness: 0.92 },
  g: { color: '#8ea2b0', roughness: 0.14, metalness: 0.55, envMapIntensity: 1.4 },
  roof: { color: '#6b6862', roughness: 0.95 },
}

// Era cut and contact shadow, injected into a stock material (and its shadow depth twin).
function eraPatch(uniforms, shade) {
  return (sh) => {
    sh.uniforms.uYear = uniforms.uYear
    sh.vertexShader = 'attribute float aStart;\nattribute float aBase;\nuniform float uYear;\nvarying float vUp;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvUp = position.y - aBase;\nif (aStart > uYear) transformed = vec3(0.0);',
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
  const out = { s: newBucket(), b: newBucket(), g: newBucket(), roof: newBucket() }
  for (const bd of data.buildings) {
    const ring = (flat) => { const p = []; for (let i = 0; i < flat.length; i += 2) p.push(new THREE.Vector2(flat[i], -flat[i + 1])); return p }
    const shape = new THREE.Shape(ring(bd.o))
    for (const h of bd.h || []) shape.holes.push(new THREE.Path(ring(h)))
    const geo = new THREE.ExtrudeGeometry(shape, { depth: bd.t - bd.b, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2) // shape (x, -z) extruded along +y
    geo.translate(0, bd.b, 0)
    const start = bd.s ?? -1e4
    for (const grp of geo.groups) push(grp.materialIndex === 0 ? out.roof : out[bd.k] || out.b, geo, grp, start, bd.b)
    geo.dispose()
  }
  return Object.fromEntries(Object.entries(out).map(([k, b]) => [k, toGeometry(b)]))
}

const newBucket = () => ({ pos: [], nor: [], uv: [], start: [], base: [] })

function push(b, geo, { start, count }, year, base) {
  const { position, normal, uv } = geo.attributes
  for (let i = start; i < start + count; i++) {
    b.pos.push(position.getX(i), position.getY(i), position.getZ(i))
    b.nor.push(normal.getX(i), normal.getY(i), normal.getZ(i))
    b.uv.push(uv.getX(i), uv.getY(i))
    b.start.push(year)
    b.base.push(base)
  }
}

function toGeometry(b) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2))
  g.setAttribute('aStart', new THREE.Float32BufferAttribute(b.start, 1))
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

  const meshes = useMemo(() => {
    if (!data) return null
    const geos = build(data)
    return Object.entries(geos).map(([k, geometry]) => {
      const material = new THREE.MeshStandardMaterial({ ...LOOK[k], ...(FACADES[k] && { map: FACADES[k]() }) })
      material.onBeforeCompile = eraPatch(uniforms, true)
      material.customProgramCacheKey = () => 'strata-era'
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
      depth.onBeforeCompile = eraPatch(uniforms, false)
      return { k, geometry, material, depth }
    })
  }, [data, uniforms])

  useEffect(() => () => meshes?.forEach((m) => { m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); m.depth.dispose() }), [meshes])

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
