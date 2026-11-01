// Which vessel the river shows for a year, and whether it needs the bascules lifted.
// Air draft: metres from the waterline to the highest point. status: inferred, period-typical figures.
export const CLEARANCE = 8.6 // m, closed deck soffit above high water

export const VESSELS = [
  // bow/stern: x offsets of the waterline footprint (bow points west, -x); the tug's includes its lighter
  { kind: 'barque', from: 1894, airDraft: 40, bow: -42, stern: 24 }, // three-masted sailing barque
  { kind: 'tug', from: 1930, airDraft: 14, bow: -15, stern: 67, hullStern: 12 }, // steam tug towing a lighter
  { kind: 'coaster', from: 1970, airDraft: 22, bow: -25, stern: 21 }, // motor coaster with a cargo mast
  { kind: 'clipper', from: 1999, airDraft: 7, bow: -20, stern: 17 }, // Thames Clipper catamaran, fits under the closed deck
]

export const vesselForYear = (year) => VESSELS.findLast((v) => year >= v.from) ?? VESSELS[0]
export const needsLift = (v) => v.airDraft > CLEARANCE
// What the ship sim sees as the leaf opening: a low vessel treats the bridge as always open.
export const leafInput = (v, open) => (needsLift(v) ? open : 1)
