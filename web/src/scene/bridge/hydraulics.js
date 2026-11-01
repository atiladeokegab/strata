// Hydraulic state sim for the bascules. Steam pumps charge weighted accumulators; the
// accumulators feed the hydraulic engines that turn pinions on the bascule quadrant racks.
// A weighted accumulator holds constant pressure (weight / ram area) while its ram is up, so
// the state is the stored volume (ram height), not pressure. Once it bottoms out the engines
// only get what the pumps deliver live.
// status: inferred. Figures (≈750 psi, ≈1 min to raise) are commonly cited, not yet in data.

export const PRESSURE_PSI = 750 // working pressure while an accumulator ram is up
export const OPEN_TIME_S = 60 // full lift at full flow, real time
export const SIM_SPEED = 4 // shortcut: time-compressed for the demo; set 1 for real time

const DEG = Math.PI / 180
const OMEGA_MAX = (86 * DEG) / OPEN_TIME_S // rad/s at full flow
const TAU = 1.5 // s, engine/leaf response lag (inertia of ~1,000 t leaf)
const SLOW_ZONE = 6 * DEG // valve throttles back over the last few degrees
const DRAW_UP = 0.012 // stored fraction per s at full speed, raising
const DRAW_DOWN = 0.003 // lowering is mostly braked against the counterweight balance
const PUMP = 0.004 // stored fraction per s the steam pumps restore

export function createHydraulics() {
  return { angle: 0, omega: 0, stored: 1, pumping: false, valve: 0 }
}

// Advance state `s` by dt seconds towards `target` (0..1 of maxAngleRad). Mutates and returns s.
export function stepHydraulics(s, target, dt, maxAngleRad) {
  const goal = Math.min(1, Math.max(0, target)) * maxAngleRad
  const err = goal - s.angle
  s.valve = Math.max(-1, Math.min(1, err / SLOW_ZONE))
  const draw = s.valve > 0 ? DRAW_UP : DRAW_DOWN
  // Ram bottomed out: flow limited to what the pumps deliver.
  const supply = s.stored > 0 ? 1 : Math.min(1, PUMP / draw)
  const want = s.valve * OMEGA_MAX * supply
  s.omega += (want - s.omega) * (1 - Math.exp(-dt / TAU))
  const next = s.angle + s.omega * dt
  s.angle = Math.min(maxAngleRad, Math.max(0, next))
  if (s.angle !== next) s.omega = 0 // hit the stop
  s.pumping = s.stored < 1
  const used = (Math.abs(s.omega) / OMEGA_MAX) * draw * dt
  s.stored = Math.min(1, Math.max(0, s.stored - used + (s.pumping ? PUMP * dt : 0)))
  return s
}
