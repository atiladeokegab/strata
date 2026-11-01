// <TowerBridge />: the procedural bridge, reading the shared store (year, exploded, bascule,
// selected, place). Meshes are named by part id; clicking one calls select(partId).
// The bascules follow a hydraulic state sim (hydraulics.js); store.bascule is the operator's
// lever, the sim decides where the leaves actually are.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useStore } from '../../store.js'
import { Part } from './Part.jsx'
import { BasculeDrive } from './BasculeDrive.jsx'
import { steelColour } from './geom.js'
import { createHydraulics, stepHydraulics, SIM_SPEED } from './hydraulics.js'
import { stageForYear, shown, eraFor, resolveYears } from './stages.js'
import { containersOf } from './xray.js'
import * as H from './history.jsx'
import * as S from './structures.jsx'
import * as D from './details.jsx'
import * as A from './approach.jsx'
import { BasculeLeafDetail } from './basculeDetail.jsx'
import { Cabin } from './cabin.jsx'
import { ConstructionSite } from './construction.jsx'
import { EngineRoom } from './engineRoom.jsx'
import { Ship } from './ship.jsx'
import { Stairs, Lifts } from './interiors.jsx'
import { Traffic } from './traffic.jsx'
import { TopView } from './topview.jsx'
import { liftSpeed, heldLever } from './liftSequence.js'
import { LiftControls } from './liftControls.jsx'

// The live sim state, for any panel that wants to show pressure or stored volume. Read-only.
export const bridgeHydraulics = createHydraulics()


const dim = (place, id, key, fallback) => place?.parts?.find((p) => p.id === id)?.dims?.[key]?.value ?? fallback

// Height a rising part has reached this year (scene-local y), or null when not rising.
const rising = (st, stage, from, to) => (st.stage === stage ? from + (to - from) * st.progress : null)

function Half({ side, rt, st, towerTop, era, maxAngle }) {
  const n = side === 'north'
  const id = (base) => `${base}-${side}`
  const towerId = n ? 'north-tower' : 'south-tower'
  const sim = rt.sim
  return (
    <group rotation={[0, n ? 0 : Math.PI, 0]}>
      {shown('cofferdam', st.stage) && (
        <Part id={id('cofferdam')} rt={rt}>
          <S.Cofferdam />
        </Part>
      )}
      <Part id={id('pier')} rt={rt} explode={[0, 6, 0]} xray clipY={rising(st, 0, S.L.hw - 3, S.L.pierTop)}>
        <S.Pier />
      </Part>
      {st.stage >= 5 && <Cabin side={side} rt={rt} />}
      {shown('abutment', st.stage) && (
        <Part id={id('abutment')} rt={rt} explode={[0, 0, -28]} clipY={rising(st, 0, S.L.hw - 1, towerTop)}>
          <S.Abutment side={side} />
          <A.RampDetails side={side} era={era} />
        </Part>
      )}
      {shown('frame', st.stage) && (
        <Part id={towerId} rt={rt} explode={[0, 4, -14]} clipY={rising(st, 1, S.L.pierTop, towerTop)}>
          <S.TowerFrame />
          <S.FixedDeck />
          <D.DeckMarkings era={era} />
        </Part>
      )}
      {/* interiors ride with the frame; separate Parts so they are clickable through the x-rayed shell */}
      {shown('frame', st.stage) && (
        <>
          <Part id={id('stairs')} rt={rt} explode={[0, 4, -14]} clipY={rising(st, 1, S.L.pierTop, towerTop)}>
            <Stairs />
          </Part>
          <Part id={id('lift')} rt={rt} explode={[0, 4, -14]} clipY={rising(st, 1, S.L.pierTop, towerTop)}>
            <Lifts sim={sim} />
          </Part>
        </>
      )}
      {/* same part id: cladding rises; exploded, the stone shell lifts clear of the steel skeleton.
          the frame is always drawn so it shows through the x-rayed shell */}
      {/* cladding rises over the finished frame without clipping the steel */}
      {shown('cladding', st.stage) && (
        <Part id={towerId} rt={rt} explode={[0, 30, -14]} xray clipY={rising(st, 4, S.L.pierTop, towerTop + 2)}>
          <S.TowerCladding topY={towerTop} />
          <D.TowerDetails />
          {era.nightLighting && <H.TowerLights />}
        </Part>
      )}
      {shown('bascule', st.stage) && (
        <>
          <Part id={n ? 'bascule-north' : 'bascule-south'} rt={rt} explode={[0, 10, 6]}>
            <BasculeDrive sim={sim} side={side} maxAngle={maxAngle}>
              <S.PivotFrame sim={sim}>
                <S.BasculeLeaf />
                <D.BasculeDetails era={era} />
                <BasculeLeafDetail sim={sim} />
              </S.PivotFrame>
            </BasculeDrive>
          </Part>
          <Part id={id('counterweight')} rt={rt} explode={[0, -10, -4]}>
            <S.PivotFrame sim={sim}>
              <S.Counterweight />
            </S.PivotFrame>
          </Part>
          <Part id={id('pivot')} rt={rt} explode={[0, -2, 8]}>
            <S.PivotShaft />
          </Part>
          <Part id={id('hydraulic-engine')} rt={rt} explode={[-22, -8, 0]}>
            <S.HydraulicEngine sim={sim} />
          </Part>
          {/* every accumulator shares one part id (the data has one `accumulator` part) */}
          <Part id="accumulator" rt={rt} explode={[24, -6, 0]}>
            <S.Accumulators sim={sim} />
          </Part>
        </>
      )}
      {st.stage >= 0 && st.stage < 5 && (
        <Part id={`works-${side}`} rt={rt}>
          <ConstructionSite st={st} towerTop={towerTop} />
        </Part>
      )}
      {shown('span', st.stage) && (
        <>
          <Part id={id('approach')} rt={rt} explode={[0, -8, -14]}>
            <S.Approach />
            <D.ApproachDetails era={era} />
          </Part>
          <Part id={id('suspension')} rt={rt} explode={[0, 12, -10]}>
            <S.Suspension />
            <D.SuspensionDetails />
          </Part>
        </>
      )}
    </group>
  )
}

export function TowerBridge(props) {
  const place = useStore((s) => s.place)
  const year = useStore((s) => s.year)
  const view = useStore((s) => s.view)
  const exploded = useStore((s) => s.exploded)
  const select = useStore((s) => s.select)
  const gl = useThree((s) => s.gl)
  const years = useMemo(() => resolveYears(place?.events), [place])
  const st = stageForYear(year, years.stages)
  const era = eraFor(year, years.eras)
  const towerTop = S.L.hw + dim(place, 'north-tower', 'height', 65)
  const maxAngle = (dim(place, 'bascule-north', 'max_angle', 86) * Math.PI) / 180

  const root = useRef()
  const rt = useMemo(
    () => ({
      root,
      sim: bridgeHydraulics,
      explode: { current: 0 },
      fades: { current: [] }, // shell part ids x-rayed for the current selection
      selected: { current: useStore.getState().selected },
      hovered: { current: null },
      steel: { current: steelColour(era) },
      road: { current: 'asphalt' },
      select,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  rt.select = select
  rt.steel.current = steelColour(era)
  rt.road.current = era.woodBlocks ? 'wood' : 'asphalt'

  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])
  useEffect(() => useStore.subscribe((s) => (rt.selected.current = s.selected)), [rt])

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 3)
    rt.explode.current += ((exploded ? 1 : 0) - rt.explode.current) * k
    rt.fades.current = containersOf(rt.selected.current)
    // Bascules can only be worked once the bridge is open (stage 5); before that they sit closed.
    const lever = st.stage >= 5 ? useStore.getState().bascule : 0
    stepHydraulics(rt.sim, heldLever(lever, rt.sim), Math.min(dt, 0.1) * SIM_SPEED * liftSpeed(), maxAngle)
  })

  return (
    <group ref={root} name="tower-bridge" {...props}>
      <Half side="north" rt={rt} st={st} towerTop={towerTop} era={era} maxAngle={maxAngle} />
      <Half side="south" rt={rt} st={st} towerTop={towerTop} era={era} maxAngle={maxAngle} />
      {year >= 1894 && <Ship rt={rt} year={year} maxAngle={maxAngle} />}
      {shown('walkway', st.stage) &&
        ['east', 'west'].map((side) => (
          <Part
            key={side}
            id={`walkway-${side}`}
            rt={rt}
            explode={[side === 'east' ? 14 : -14, 20, 0]}
            clipY={rising(st, 3, S.L.walkY - 0.5, S.L.walkY + S.L.walkH + 0.5)}
            dim={st.stage >= 5 && !era.walkwayOpen ? 0.7 : 0}
          >
            <S.Walkway x={side === 'east' ? S.L.walkX : -S.L.walkX} glazed={era.glazed} glassFloor={era.glassFloor} />
            <D.WalkwayDetails x={side === 'east' ? S.L.walkX : -S.L.walkX} />
            {st.stage >= 5 && era.walkwayOpen && <H.WalkwayPeople x={side === 'east' ? S.L.walkX : -S.L.walkX} />}
            {era.olympics && side === 'east' && <H.OlympicRings x={side === 'east' ? S.L.walkX : -S.L.walkX} />}
          </Part>
        ))}
      {shown('engine', st.stage) && <EngineRoom rt={rt} steam={era.steam} third={era.thirdEngine} explode={[14, 6, 20]} />}
      <TopView st={st} year={year} maxAngle={maxAngle} sim={bridgeHydraulics} />
      {/* traffic rides no part, so it would float over the exploded decks; hide it but keep its sim */}
      {st.stage >= 5 && (
        <group visible={!exploded}>
          <Traffic rt={rt} year={year} sim={bridgeHydraulics} maxAngle={maxAngle} />
        </group>
      )}
      {st.stage >= 5 && <LiftControls year={year} towerTop={towerTop} style={LABEL} />}
      {/* the top view draws its own build caption */}
      {st.stage < 5 && view !== 'top' && (
        <Html position={[0, towerTop + 14, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="bridge-stage-label" style={LABEL}>
            <span style={{ opacity: 0.7, marginRight: 8 }}>{year}</span>
            {st.label}
          </div>
        </Html>
      )}
    </group>
  )
}

const LABEL = {
  whiteSpace: 'nowrap',
  padding: '6px 12px',
  borderRadius: 999,
  background: 'rgba(12,16,22,0.72)',
  color: '#f3efe6',
  font: '500 13px/1.2 system-ui, sans-serif',
  letterSpacing: '0.02em',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255,255,255,0.14)',
}

export default TowerBridge
