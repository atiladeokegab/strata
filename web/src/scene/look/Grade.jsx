// The post stack, in its own chunk (postprocessing is ~350 KB) so the scene is lit before it arrives:
// N8AO (faded with height), light bloom, ACES, the period grade by year, vignette, SMAA.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { BrightnessContrastEffect, HueSaturationEffect, SepiaEffect, ToneMappingMode, VignetteEffect } from 'postprocessing'
import * as THREE from 'three'
import { useStore } from '../../store'
import { periodGrade } from './sun'
import { LITE } from './tier'

const AO = 1.6
// Lite (phones) keeps only the grade: no AO, bloom or SMAA, so the post stack is 2 passes, not ~20.
export default function Grade({ low }) {
  const fx = useMemo(() => ({
    sat: new HueSaturationEffect(),
    bc: new BrightnessContrastEffect(),
    sepia: new SepiaEffect({ intensity: 0 }),
    vig: new VignetteEffect({ offset: 0.3, darkness: 0.38 }),
  }), [])
  useEffect(() => () => Object.values(fx).forEach((e) => e.dispose()), [fx])
  const k = useRef(periodGrade(useStore.getState().year))
  const ao = useRef()
  useFrame(({ camera }, dt) => {
    // AO grounds things up close; from altitude it only greys the dense LiDAR roofscape, so fade it out
    if (ao.current) ao.current.configuration.intensity = AO * (1 - 0.75 * THREE.MathUtils.smoothstep(camera.position.y, 150, 900))
    const p = (k.current = THREE.MathUtils.damp(k.current, periodGrade(useStore.getState().year), 4, dt))
    fx.sat.saturation = 0.04 - 0.4 * p
    fx.sepia.intensity = 0.42 * p
    fx.bc.contrast = 0.08 - 0.05 * p
    fx.bc.brightness = 0.01 * p
    fx.vig.darkness = 0.38 + 0.2 * p
  })
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {!low && !LITE && <N8AO ref={ao} halfRes aoRadius={2} distanceFalloff={1} intensity={AO} quality="medium" />}
      {!LITE && <Bloom mipmapBlur levels={5} intensity={0.3} luminanceThreshold={1} luminanceSmoothing={0.2} />}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={fx.sat} dispose={null} />
      <primitive object={fx.bc} dispose={null} />
      <primitive object={fx.sepia} dispose={null} />
      <primitive object={fx.vig} dispose={null} />
      {!LITE && <SMAA />}
    </EffectComposer>
  )
}
