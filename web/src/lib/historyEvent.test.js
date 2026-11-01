import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { eventAtYear } from './historyEvent.js'

const place = JSON.parse(readFileSync(new URL('../../../data/places/tower-bridge.json', import.meta.url)))

test('the exhibit selects the event for each construction year and pre-bridge context', () => {
  assert.equal(eventAtYear(place.events, 1175), undefined)
  assert.equal(eventAtYear(place.events, 1885).year, 1885)
  for (let year = 1886; year <= 1894; year++) assert.equal(eventAtYear(place.events, year).year, year)
})

test('the exhibit selects later milestones without inventing events in between', () => {
  assert.equal(eventAtYear(place.events, 1950).year, 1910)
  assert.equal(eventAtYear(place.events, 1982).year, 1982)
})

test('event ordering is stable for the input and uses stage to break same-year ties', () => {
  const events = [{ year: 1890, stage: 2 }, { year: 1889, stage: 4 }, { year: 1890, stage: 6 }]
  const before = structuredClone(events)
  assert.equal(eventAtYear(events, 1890).stage, 6)
  assert.deepEqual(events, before)
})
