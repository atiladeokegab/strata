// The light: Poly Haven's evening_road_01_puresky (CC0), a clear late afternoon with the sun ~15 degrees up.
// It is rotated so the sun sits in the south-west over London. Scene frame: x east, y up, z south.
import * as THREE from 'three'
import { LITE } from './tier'

// The puresky HDRI with a warm grey-green ground blended in below the horizon (it was mirrored blue sky, so
// metal facing down or sideways reflected near-black); envLow.js is its 32x16 instant copy.
export const HDRI = '/hdri/evening_road_ground_1k.hdr'
export const SKY_JPG = LITE ? '/hdri/evening_road_01_puresky_2k.jpg' : '/hdri/evening_road_01_puresky_4k.jpg'

// Sun direction as found in the HDRI (brightest pixels, three's equirect frame), and the yaw that turns
// it to azimuth ~238 degrees (south-west).
const SUN_IN_HDRI = new THREE.Vector3(0.7365, 0.2517, 0.6278).normalize()
export const ENV_ROTATION = THREE.MathUtils.degToRad(-107.5)
export const SUN_DIR = SUN_IN_HDRI.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ENV_ROTATION)

export const SUN_COLOR = '#ffd9b0'
// Horizon colour of the HDRI (linear), so distant haze melts into the sky.
export const HAZE = new THREE.Color().setRGB(0.77, 0.86, 0.88, THREE.LinearSRGBColorSpace)

// 1 = full period grade (before 1950), 0 = neutral (today); eases across 1950-1990.
export const periodGrade = (year) => THREE.MathUtils.clamp((1990 - year) / 40, 0, 1)
