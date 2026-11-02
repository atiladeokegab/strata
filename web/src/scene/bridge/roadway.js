// Deck cross-section, shared by the kerbs (details.jsx, approach.jsx) and checked against the
// traffic lanes in check.mjs. A 36 ft carriageway between kerbs and a 12 ft footway each side out
// to the parapet (Barry, 1894; 60 ft between parapets). Footways are raised so walk mode steps up.
export const KERB_X = 5.5 // kerb face, |x|
export const KERB_W = 0.3
export const FOOTWAY_H = 0.15 // footway top above the road
export const FOOTWAY_OUT = 9.1 // outer edge, at the parapet
// Opening span and tower passage: 50 ft between parapets, a 32 ft carriageway and two 9 ft footways
// (Barry 1894 p.37, measured). The tower passage is inferred: the chain pillars, 60 ft 6 in apart
// (p.50), leave no room for the 60 ft section, so the width steps at each tower's shore face.
export const NARROW = { kerbX: 4.88, out: 7.62 } // from each tower's shore face (L.pierZ - L.towerHalfZ) to the centre
export const WIDE = { kerbX: KERB_X, out: FOOTWAY_OUT }
// Bascule leaf: four main girders 13 ft 6 in apart (Barry p.37), edge girder under the footway's outer edge
export const LEAF_GIRDERS = [-6.17, -2.06, 2.06, 6.17]
export const LEAF_EDGE = 7.6 // its fascia (to 7.91) stays inside the 8 m jamb as the leaf rises

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
