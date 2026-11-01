// Top-down callouts: which parts get a label, where each one anchors (bridge-local metres), and
// a pure greedy declutter that picks a non-overlapping label spot around each anchor on screen.
// mirror of the L constants in structures.jsx (that module is JSX, so node's check.mjs cannot load it)
const L = { pierZ: -45.5, pierTop: -1, walkX: 10.5, walkY: 35, walkH: 4.3, spanEnd: -138.5 }

// kind: the stages.js part kind that must exist this year for the callout to show.
export const CALLOUTS = [
  { id: 'north-tower', label: 'North tower', kind: 'frame', pos: [0, 50, L.pierZ] },
  { id: 'south-tower', label: 'South tower', kind: 'frame', pos: [0, 50, -L.pierZ] },
  { id: 'bascule-north', label: 'North bascule', kind: 'bascule', pos: [0, 0, L.pierZ / 2.6] },
  { id: 'bascule-south', label: 'South bascule', kind: 'bascule', pos: [0, 0, -L.pierZ / 2.6] },
  { id: 'pier-north', label: 'North pier', kind: 'pier', pos: [-24, L.pierTop, L.pierZ - 10] },
  { id: 'pier-south', label: 'South pier', kind: 'pier', pos: [24, L.pierTop, -L.pierZ + 10] },
  { id: 'engine-room', label: 'Engine room', kind: 'engine', pos: [35, 5, 155] },
  { id: 'accumulator', label: 'Accumulators', kind: 'bascule', pos: [17, 12, L.pierZ - 6] },
  { id: 'walkway-east', label: 'East walkway', kind: 'walkway', pos: [L.walkX, L.walkY + L.walkH, 8] },
  { id: 'walkway-west', label: 'West walkway', kind: 'walkway', pos: [-L.walkX, L.walkY + L.walkH, -8] },
  { id: 'approach-north', label: 'North approach', kind: 'span', pos: [0, 0, (L.pierZ + L.spanEnd) / 2] },
  { id: 'approach-south', label: 'South approach', kind: 'span', pos: [0, 0, -(L.pierZ + L.spanEnd) / 2] },
]

const GAP = 44 // leader length in px
const DIRS = [[0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1]]
const DOT = 10 // every anchor dot is kept clear of labels too

export const labelSize = (text) => ({ w: 14 + text.length * 7, h: 22 })

const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// items: [{id, x, y, w, h}] in screen px (anchor point, label size), in priority order.
// -> {id: {dx, dy}} for labels that fit, offset of the label centre from its anchor;
// labels whose anchor is off screen or that cannot avoid an earlier label are left out.
export function placeLabels(items, width, height) {
  const placed = items.map((it) => ({ x: it.x - DOT / 2, y: it.y - DOT / 2, w: DOT, h: DOT }))
  const out = {}
  for (const it of items) {
    if (it.x < 0 || it.y < 0 || it.x > width || it.y > height) continue
    for (const [ux, uy] of DIRS) {
      // sideways labels move out by half their width so the leader keeps its length
      const dx = ux * (GAP + it.w / 2 - 20), dy = uy * GAP
      const r = { x: it.x + dx - it.w / 2, y: it.y + dy - it.h / 2, w: it.w, h: it.h }
      if (r.x < 0 || r.y < 0 || r.x + r.w > width || r.y + r.h > height) continue
      if (placed.some((p) => hit(p, r))) continue
      placed.push(r)
      out[it.id] = { dx, dy }
      break
    }
  }
  return out
}
