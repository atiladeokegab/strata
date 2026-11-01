// London, a clear late afternoon: sun low in the south-west. Scene frame: x east, y up, z south.
import * as THREE from 'three'

const ELEVATION = 13 // degrees above the horizon
const AZIMUTH = 238 // degrees clockwise from north

const el = THREE.MathUtils.degToRad(ELEVATION)
const az = THREE.MathUtils.degToRad(AZIMUTH)
export const SUN_DIR = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize()

export const SUN_COLOR = '#ffd2a1'
export const HAZE = '#d6cfc4'
export const SKY = { turbidity: 8, rayleigh: 1.4, mieCoefficient: 0.006, mieDirectionalG: 0.82 }

// 1 = full period grade (before 1950), 0 = neutral (today); eases across 1950-1990.
export const periodGrade = (year) => THREE.MathUtils.clamp((1990 - year) / 40, 0, 1)
