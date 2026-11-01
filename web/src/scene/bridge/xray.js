// Which see-through shells fade when a part is selected: only the ones that hide it.
// Exploded view fades every shell; that is handled in Part, not here.
export function containersOf(sel) {
  if (!sel) return []
  const m = sel.match(/^(stairs|lift|hydraulic-engine|counterweight|pivot)-(north|south)$|^(north|south)-tower$/)
  if (m?.[3]) return [sel]
  if (m) return [m[1] === 'stairs' || m[1] === 'lift' ? `${m[2]}-tower` : `pier-${m[2]}`]
  if (sel === 'accumulator') return ['pier-north', 'pier-south', 'engine-room']
  if (sel === 'engine-room') return ['engine-room']
  return []
}
