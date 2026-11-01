// Pure lever maths for BasculeDrive.jsx, kept out of JSX so check.mjs can test it under node.
export const KEY_STEP = Math.PI / 36 // 5° of leaf per arrow press

const clamp01 = (v) => Math.min(1, Math.max(0, v))

// Lever (0 closed .. 1 open) after turning the leaf by `closeDelta` radians; positive closes it.
export const leverAfter = (lever, closeDelta, maxAngle) => clamp01(lever - closeDelta / maxAngle)

// Lever for a key press, or null when the key does nothing. Home closes fully, End opens fully.
export function leverForKey(key, lever, maxAngle) {
  if (key === 'Home') return 0
  if (key === 'End') return 1
  if (key === 'ArrowUp' || key === 'ArrowRight') return leverAfter(lever, -KEY_STEP, maxAngle)
  if (key === 'ArrowDown' || key === 'ArrowLeft') return leverAfter(lever, KEY_STEP, maxAngle)
  return null
}

export const leverLabel = (side, lever) =>
  `${side[0].toUpperCase()}${side.slice(1)} bascule lever, ${Math.round(clamp01(lever) * 100)} percent open`
