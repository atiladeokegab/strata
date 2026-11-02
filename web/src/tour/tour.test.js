// The story's opening (hackathon lessons, 37: judges decide in the first 20 s): run with node --test.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TRACKS, BEATS, CARD, KEYS, OPENED, runTracks } from './tour.js'
import { useStore } from '../store.js'
import { FAST_LEAVES_S, lift, createLift } from '../scene/bridge/liftSequence.js'
import { vesselForYear, needsLift } from '../scene/bridge/vessels.js'

// story time the leaves start to move: the lift cue plus the fast lift's asserted ceiling (bridge/check.mjs)
const wow = TRACKS.find((k) => k.wow).from + FAST_LEAVES_S

test('the wow starts by 10 s: the bridge lifting', () => {
  assert.ok(wow <= 10, `the leaves start moving at ${wow} s of story time; the rule is 10 s`)
})

test('it lifts in its best era, for a ship that needs it, with the one number on screen', () => {
  Object.assign(lift, createLift())
  runTracks(-1, 0, {}) // the opening cues
  assert.equal(useStore.getState().year, OPENED, 'opening day, 1894')
  assert.equal(lift.phase, 'red', 'the lift is called at once')
  assert.ok(needsLift(vesselForYear(OPENED)), 'the 1894 ship is too tall for the closed deck')
  const beat = BEATS.find((b) => b.angle)
  assert.ok(beat && beat.from <= 1 && beat.to >= wow + 4, 'the live leaf angle is on screen from the first second, past full open')
})

test('no title card first; the problem is stated by 20 s', () => {
  assert.ok(CARD.from >= wow, `the problem card waits for the lift (${CARD.from} s)`)
  assert.ok(CARD.until <= 20, `problem plus wow by 20 s (card ends ${CARD.until} s)`)
  assert.ok(KEYS[0].r < 400, 'the first frame is on the bridge, not a city overview')
})
