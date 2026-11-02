// node src/scene/google/frame.check.mjs: the gap covers every part of our bridge and leaves the river and the city
import assert from 'node:assert/strict'
import { inGap } from './frame.js'
const ours = { 'deck centre': [0, 0, 0], 'ramp end north': [9, -3, -183], 'pier corner': [28.5, -1, 60], 'tower top': [12.5, 60, -40],
  'chain mid-span': [10.5, 15, 100], 'abutment tower outer north': [16, 18, -148], 'accumulator': [21, 10, 143.8], 'engine house far corner': [44, 8, 166],
  'chimney': [41.5, 30, 149], 'walkway': [10.5, 37, 0] }
for (const [k, p] of Object.entries(ours)) assert.ok(inGap(...p), `${k} is cut from the tiles`)
const theirs = { 'the Thames': [0, -13.5, 0], 'river beside the piers': [60, 0, 45], 'Tower of London side': [-60, 0, -200], 'approach street far': [0, 0, -260] }
for (const [k, p] of Object.entries(theirs)) assert.ok(!inGap(...p), `${k} stays`)
console.log('frame ok')
