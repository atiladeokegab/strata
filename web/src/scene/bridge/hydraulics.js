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
export const DRAW_UP = 0.012 // stored fraction per s at full speed, raising
const DRAW_DOWN = 0.003 // lowering is mostly braked against the counterweight balance
const PUMP = 0.004 // stored fraction per s the steam pumps restore

export function createHydraulics() {
  return { angle: 0, omega: 0, stored: 1, pumping: false, valve: 0, bolts: 1, seated: BOLT_SETTLE_S, locked: true }
}

// Nose bolts and tail locks: drawn (bolts -> 0) as soon as the lever is up or the leaf is off its
// seat; driven home (-> 1) only after the leaf has sat closed for BOLT_SETTLE_S. `locked` is the
// interlock the traffic gates read. Times are sim seconds (scaled by SIM_SPEED like the lift).
export const BOLT_SETTLE_S = 1
export const BOLT_TRAVEL_S = 0.6
export function stepBolts(s, target, dt) {
  s.seated = s.angle > 0.001 || target > 0 ? 0 : s.seated + dt
  const goal = s.seated >= BOLT_SETTLE_S ? 1 : 0
  s.bolts += Math.sign(goal - s.bolts) * Math.min(Math.abs(goal - s.bolts), dt / BOLT_TRAVEL_S)
  s.locked = s.bolts === 1
  return s
}

// Advance state `s` by dt seconds towards `target` (0..1 of maxAngleRad). Mutates and returns s.
export function stepHydraulics(s, target, dt, maxAngleRad) {
  s.max = maxAngleRad
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
  return stepBolts(s, target, dt)
}

// The 1894 passenger lifts ran off the same accumulators. Two cars per tower run counter-phase,
// so one is always rising: a running pair draws LIFT_DRAW, and both wait while the rams are empty.
export const LIFT_DRAW = 0.0006 // stored fraction per s, ~1/20 of DRAW_UP
export const LIFT_RATE = 0.12 // rad/s of the car cycle, ~50 s round trip

export const createCars = () => ({ phase: 0 })

// Advance lift pair `l` by dt real seconds against accumulator state `sim`. Mutates both.
export function stepCars(l, sim, dt) {
  if (sim.stored <= 0) return l // no pressure: the cars wait
  l.phase += LIFT_RATE * dt
  sim.stored = Math.max(0, sim.stored - LIFT_DRAW * dt)
  return l
}

// Car height 0..1 for car i (0 or 1) of a pair.
export const carHeight = (l, i) => (1 - Math.cos(l.phase + i * Math.PI)) / 2
// What the cabin's pressure gauge reads: full working pressure while an accumulator ram is up;
// once it bottoms out, raising sags to the share of the flow the pumps alone can deliver.
export const gaugePsi = (s) => (s.stored > 0 ? PRESSURE_PSI : PRESSURE_PSI * Math.min(1, PUMP / (s.valve > 0 ? DRAW_UP : DRAW_DOWN)))
