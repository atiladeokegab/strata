// Construction stages, in the order the bridge was built (1886 → 1894). These are fallbacks:
// resolveYears() takes a year from data/places/tower-bridge.json where an event matches.
// The data's events[].stage counts 0–8 in a different order, so events match by title, not stage.
export const STAGES = [
  { stage: 0, from: 1886, to: 1887, label: 'Piers and cofferdams', status: 'inferred' },
  { stage: 1, from: 1888, to: 1889, label: 'Steel frames rising', status: 'inferred' },
  { stage: 2, from: 1890, to: 1890, label: 'Bascules, pivots and counterweights', status: 'inferred' },
  { stage: 3, from: 1891, to: 1891, label: 'High walkways and suspension chains', status: 'inferred' },
  { stage: 4, from: 1892, to: 1893, label: 'Stone cladding', status: 'inferred' },
  { stage: 5, from: 1894, to: Infinity, label: 'Opened, 30 June 1894', status: 'inferred' },
]

// -> {stage, label, progress 0..1 within the stage}; stage -1 before work began.
export function stageForYear(year, stages = STAGES) {
  const s = stages.findLast((x) => year >= x.from)
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

// Shore approach works: the abutment towers rise in stage 0 (with the piers), the ramp embankment
// and parapets rise through stages 1-3, and the road surface is laid in 1893, the last year of
// stage 4. -> {ramp 0..1, road, label}; label null when no work is going on.
export function approachWorks({ stage, progress }) {
  if (stage >= 5) return { ramp: 1, road: true, label: null }
  if (stage < 1) return { ramp: 0, road: false, label: stage < 0 ? null : 'Abutment towers rising' }
  if (stage <= 3) return { ramp: Math.min(1, (stage - 1 + progress) / 3), road: false, label: 'Approach ramp: embankment and parapets rising' }
  return progress < 1 ? { ramp: 1, road: false, label: 'Approach ramp built, road to be laid' } : { ramp: 1, road: true, label: 'Road surface laid' }
}

export const shown = (kind, stage) => {
  const r = PART_STAGE[kind]
  return stage >= r.from && (r.until === undefined || stage <= r.until)
}

// Later history, after opening. One table so the year slider, the scene and check.mjs agree.
// Fallback years from the Tower Bridge history (wiki-tb); resolveYears() overrides from events.
export const ERAS = {
  walkwaysClosed: 1910, // closed to the public for lack of use
  asphalt: 1930, // carriageway wood blocks -> asphalt, and painted markings; inferred, no dated source yet
  battleshipGrey: 1939, // steel repainted grey as camouflage, "pre-WW2" (towerbridge.org.uk); year inferred
  blackout: 1939, // wartime: lamps dark, kerbs and lamp posts banded white, sandbags (blackout from 1 Sept 1939)
  thirdEngine: 1941, // a third steam pumping engine added (Tower Bridge's own account and the Forncett engine record; Wikipedia's 1942 is the outlier)
  blackoutEnd: 1945,
  electricLamps: 1950, // approach lanterns gas -> electric; inferred, no dated source yet
  electricDrive: 1976, // steam pumping engines replaced by electro-hydraulic drive
  jubilee: 1977, // red, white and blue paint (steelColour in geom.js)
  walkwaysReopened: 1982, // reopened, glazed, as the exhibition
  engineMuseum: 1982, // engine rooms open to visitors with the exhibition; inferred, no dated source in the data yet
  nightLighting: 2012, // floodlighting fixtures on the towers; Atlas's 2012 floodlighting event in the data lands at the same time
  olympics: 2012, // Olympic rings hung from the walkways, that year only
  glassFloor: 2014, // glass floor panels in the walkways
}

// Which data event, by title, dates each threshold. Stages 1–4 have no clean match in the data.
const STAGE_EVENTS = { 0: /river foundations begin/i, 5: /tested and opened/i }
const ERA_EVENTS = {
  walkwaysClosed: /walkways close/i,
  electricDrive: /electric power replaces steam/i,
  jubilee: /jubilee/i,
  walkwaysReopened: /walkways reopen/i,
  nightLighting: /floodlight/i,
  olympics: /olympic rings/i,
  glassFloor: /glass floor/i,
}

// A sourced year: an event matching `re` that cites a source and is not itself inferred.
const sourcedYear = (events, re) => {
  const e = re && events.find((x) => re.test(x.title ?? ''))
  return e && Number.isInteger(e.year) && e.sources?.length && e.status !== 'inferred' ? e.year : null
}

// place.events -> {stages: STAGES with data years, eras: {key: {year, status}}}.
// status is 'sourced' when the year came from the data, 'inferred' when it is our constant.
export function resolveYears(events = []) {
  const ev = events ?? []
  const stages = STAGES.map((s) => {
    const y = sourcedYear(ev, STAGE_EVENTS[s.stage])
    return y ? { ...s, from: y, status: 'sourced' } : s
  })
  // a sourced year that breaks the build order would break stageForYear; keep the constant then
  for (let i = 0; i < stages.length; i++)
    if (stages[i - 1]?.from >= stages[i].from || stages[i + 1]?.from <= stages[i].from) stages[i] = STAGES[i]
  stages.forEach((s, i) => (stages[i] = { ...s, to: i + 1 < stages.length ? stages[i + 1].from - 1 : Infinity }))
  const eras = Object.fromEntries(
    Object.entries(ERAS).map(([k, fallback]) => {
      const y = sourcedYear(ev, ERA_EVENTS[k])
      return [k, y ? { year: y, status: 'sourced' } : { year: fallback, status: 'inferred' }]
    }),
  )
  return { stages, eras }
}

const FALLBACK = resolveYears().eras

export function eraFor(year, eras = FALLBACK) {
  const y = (k) => eras[k].year
  return {
    walkwayOpen: year < y('walkwaysClosed') || year >= y('walkwaysReopened'),
    blackout: year >= y('blackout') && year < y('blackoutEnd'),
    gasLamps: year < y('electricLamps'),
    woodBlocks: year < y('asphalt'),
    greyPaint: year >= y('battleshipGrey'),
    jubileePaint: year >= y('jubilee'),
    glazed: year >= y('walkwaysReopened'),
    engineMuseum: year >= y('engineMuseum'),
    thirdEngine: year >= y('thirdEngine'),
    steam: year < y('electricDrive'),
    nightLighting: year >= y('nightLighting'),
    olympics: year === y('olympics'),
    glassFloor: year >= y('glassFloor'),
  }
}
