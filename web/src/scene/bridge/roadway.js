// Deck cross-section, shared by the kerbs (details.jsx, approach.jsx) and checked against the
// traffic lanes in check.mjs. A 36 ft carriageway between kerbs and a 12 ft footway each side out
// to the parapet (Barry, 1894; 60 ft between parapets). Footways are raised so walk mode steps up.
export const KERB_X = 5.5 // kerb face, |x|
export const KERB_W = 0.3
export const FOOTWAY_H = 0.15 // footway top above the road
export const FOOTWAY_OUT = 9.1 // outer edge, at the parapet
