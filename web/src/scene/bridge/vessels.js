// Which vessel the river shows for a year, and whether it needs the bascules lifted.
// Air draft: metres from the waterline to the highest point. status: inferred, period-typical figures.
export const CLEARANCE = 8.6 // m, closed deck soffit above high water

export const VESSELS = [
  { kind: 'barque', from: 1894, airDraft: 40 }, // three-masted sailing barque
  { kind: 'tug', from: 1930, airDraft: 14 }, // steam tug towing a lighter
  { kind: 'coaster', from: 1970, airDraft: 22 }, // motor coaster with a cargo mast
  { kind: 'clipper', from: 1999, airDraft: 6 }, // Thames Clipper catamaran, fits under the closed deck
]

export const vesselForYear = (year) => VESSELS.findLast((v) => year >= v.from) ?? VESSELS[0]
export const needsLift = (v) => v.airDraft > CLEARANCE
// What the ship sim sees as the leaf opening: a low vessel treats the bridge as always open.
export const leafInput = (v, open) => (needsLift(v) ? open : 1)
