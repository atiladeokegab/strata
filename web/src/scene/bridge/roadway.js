// Deck cross-section, shared by the kerbs (details.jsx, approach.jsx) and checked against the
// traffic lanes in check.mjs. A 36 ft carriageway between kerbs and a 12 ft footway each side out
// to the parapet (Barry, 1894; 60 ft between parapets). Footways are raised so walk mode steps up.
export const KERB_X = 5.5 // kerb face, |x|
export const KERB_W = 0.3
export const FOOTWAY_H = 0.15 // footway top above the road
export const FOOTWAY_OUT = 9.1 // outer edge, at the parapet

// Carriageway surface by era: wood blocks from 1894 (towerbridge.org.uk timeline: "wooden flooring,
// paving ... completed", June 1894), asphalt later (eraFor().woodBlocks). Swapped in place on the
// road material Look.jsx has already textured, so it costs no draw call on either tier.
const SURFACES = { asphalt: { variant: 'asphalt', tile: 6, color: '#3f3f3f' }, wood: { variant: 'wood:block', tile: 3.2, color: '#7a6450' } }
// false until Look has given the material its maps; Part retries next frame
export function roadSurface(m, key, pbr) {
  if (!m.map) return false
  if (m.userData.surface === key) return true
  const s = SURFACES[key], t = pbr(s.variant, 1 / s.tile, true)
  Object.assign(m, { map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap })
  m.normalScale.copy(t.normalScale)
  m.color.set(s.color)
  m.userData.surface = key
  return true
}
