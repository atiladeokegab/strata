// Construction stages, in the order the bridge was built (1886 → 1894).
// status: inferred from the construction history on wiki-tb; years should move to sourced
// events in data/places/tower-bridge.json (events[].stage uses these same numbers).
export const STAGES = [
  { stage: 0, from: 1886, to: 1887, label: 'Piers and cofferdams' },
  { stage: 1, from: 1888, to: 1889, label: 'Steel frames rising' },
  { stage: 2, from: 1890, to: 1890, label: 'Bascules, pivots and counterweights' },
  { stage: 3, from: 1891, to: 1891, label: 'High walkways and suspension chains' },
  { stage: 4, from: 1892, to: 1893, label: 'Stone cladding' },
  { stage: 5, from: 1894, to: Infinity, label: 'Opened, 30 June 1894' },
]

// -> {stage, label, progress 0..1 within the stage}; stage -1 before work began.
export function stageForYear(year) {
  const s = STAGES.findLast((x) => year >= x.from)
  if (!s) return { stage: -1, label: 'Before construction', progress: 0 }
  const span = s.to === Infinity ? 1 : s.to - s.from + 1
  return { stage: s.stage, label: s.label, progress: Math.min(1, (year - s.from + 1) / span) }
}

// First stage at which each kind of part exists; `until` hides scaffolding later.
export const PART_STAGE = {
  cofferdam: { from: 0, until: 0 },
  pier: { from: 0 },
  frame: { from: 1 },
  bascule: { from: 2 },
  machinery: { from: 2 },
  walkway: { from: 3 },
  chain: { from: 3 },
  span: { from: 3 },
  abutment: { from: 0 },
  cladding: { from: 4 },
  engine: { from: 5 }, // south-bank power house, 1894
}

export const shown = (kind, stage) => {
  const r = PART_STAGE[kind]
  return stage >= r.from && (r.until === undefined || stage <= r.until)
}
