// "Lift for a ship": the full sequence as a small pure state machine. liftForShip() starts it;
// stepLift() is called every frame (traffic.jsx drives it) with the live sims and returns the
// lever the operator should hold, or null to leave the lever alone. `lift` is the state a UI reads:
// phase, caption, and red (signals held red by the sequence, before the lever moves).
// Phases: red → raising → passing → lowering → resume → idle.
export const PASSED_X = -60 // ship's x once it is clear of the opening, heading west
const RESUME_S = 6 // how long the "Traffic resumes" caption stays up

export const CAPTIONS = {
  idle: '',
  red: 'Signals to red',
  raising: 'Raising the bascules',
  passing: 'Ship passing',
  lowering: 'Lowering',
  resume: 'Traffic resumes',
}

export const createLift = () => ({ phase: 'idle', caption: '', red: false, t: 0, seenEast: false })
export const lift = createLift()

const go = (s, phase) => Object.assign(s, { phase, caption: CAPTIONS[phase], red: phase === 'red', t: 0 })

// Start (or restart after "Traffic resumes") the sequence. Returns the live state object.
export function liftForShip(s = lift) {
  if (s.phase === 'idle' || s.phase === 'resume') go(s, 'red'), (s.seenEast = false)
  return s
}

// io: { dt, onLeaves (count of road users on a leaf), angle, maxAngle, shipX, shipSailing }
export function stepLift(s, io) {
  s.t += io.dt
  if (s.phase !== 'idle' && io.shipX > PASSED_X) s.seenEast = true
  switch (s.phase) {
    case 'red':
      if (io.onLeaves === 0) go(s, 'raising')
      return s.phase === 'raising' ? 1 : 0
    case 'raising':
      if (io.shipSailing && io.angle > 0.8 * io.maxAngle) go(s, 'passing')
      return 1
    case 'passing':
      // seenEast: a ship still leaving from an earlier lift does not count as this one passing
      if (s.seenEast && io.shipX < PASSED_X) go(s, 'lowering')
      return s.phase === 'lowering' ? 0 : 1
    case 'lowering':
      if (io.angle < 0.001) go(s, 'resume')
      return 0
    case 'resume':
      if (s.t > RESUME_S) go(s, 'idle')
      return null
    default:
      return null
  }
}
