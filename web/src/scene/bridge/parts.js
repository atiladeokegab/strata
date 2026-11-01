// Every part id the scene renders: the key shared with data/places/tower-bridge.json parts[].
// check.mjs scans bridge/*.jsx and fails if a <Part id> is missing here.
const both = (base) => [`${base}-north`, `${base}-south`]
export const PART_IDS = [
  ...['pier', 'cofferdam', 'abutment', 'approach', 'suspension', 'counterweight', 'pivot', 'hydraulic-engine'].flatMap(both),
  'north-tower', 'south-tower', 'bascule-north', 'bascule-south',
  'walkway-east', 'walkway-west',
  ...both('stairs'), ...both('lift'), ...both('works'), ...both('barrier'), ...both('cabin'), ...both('cabin-controls'),
  'accumulator', 'engine-room', 'ship', 'traffic',
]
