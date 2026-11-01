// The guided tour: an interactive, skippable walk through every feature, one live action per step.
// <Guide /> (Guide.jsx) shows the card; this file holds the steps and their state. The 60 s story (tour.js) is the
// passive film version; this is the hands-on one. Steps drive the app only through store setters, flyTo (CameraRig
// flies there smoothly) and a few shell inputs it fills in like a visitor would.
import { create } from 'zustand'
import { useStore, THIS_YEAR } from '../store.js'
import { stopTour } from './tour.js'
import { liftForShip } from '../scene/bridge/liftSequence.js'

export const useGuide = create(() => ({ active: false, i: 0, steps: [] }))

const s = () => useStore.getState()
const narrow = () => matchMedia('(max-width: 900px)').matches // phones: the panel is a bottom sheet

// Fill a shell input the way typing would, so React's own handler runs (search hits, the docent's form).
export function type(selector, text, submit = false) {
  const el = document.querySelector(selector)
  if (!el) return false
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, text)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  if (submit) setTimeout(() => el.form?.requestSubmit(), 60) // after React has the new value
  return true
}

const latestEvent = (year) => [...(s().place?.events ?? [])].filter((e) => e.year <= year).sort((a, b) => b.year - a.year)[0]
const yearStop = (year, note) => ({
  label: year === THIS_YEAR ? 'Today' : String(year),
  run: () => s().setYear(year),
  text: () => {
    const e = year === THIS_YEAR ? null : latestEvent(year)
    return [e && `${e.year}: ${e.title}.`, note].filter(Boolean).join(' ')
  },
})

const asked = { docent: false } // the docent question is asked once per guide run, not again on Back

// state: what the app should show for the step (anything left out returns to DEFAULT, so Back and Next are clean).
// cam: a flyTo position (CameraRig looks back at the bridge). spot: the control to point at. when: show the step only if true.
const DEFAULT = { year: THIS_YEAR, exploded: false, lidar: false, view: 'orbit', selected: null, sheet: false }
export const STEPS = [
  { id: 'orbit', title: 'Look around', cam: [170, 75, 190],
    text: 'Tower Bridge, rebuilt on real LiDAR ground. Drag to orbit, pinch or scroll to zoom.' },
  { id: 'time', title: 'Scrub through time', spot: '.dock .timeline', cam: [260, 95, 300],
    text: 'The year slider rebuilds the bridge and the area around it.',
    stops: [
      yearStop(1886, 'Construction starts on the river piers.'),
      yearStop(1890, 'Before 1950 the ground is the Ordnance Survey map of the 1890s.'),
      yearStop(1940),
      yearStop(THIS_YEAR, 'The modern city, in 3D around it.'),
    ] },
  { id: 'exploded', title: 'Take it apart', spot: '.toggles button:first-child', cam: [150, 60, 175], state: { exploded: true },
    text: 'Exploded view pulls every part away from the others, so you can see how it fits together.' },
  { id: 'bascules', title: 'Watch it work', spot: '.dock .bascule', cam: [190, 24, 40],
    text: 'Signals to red, the bascules rise on simulated hydraulics, and a ship comes through. Drag the Bascules slider to work them yourself.',
    run: () => liftForShip({ fast: true }) },
  { id: 'part', title: 'Tap any part', spot: '.panel', state: { selected: 'counterweight-north', sheet: true },
    text: 'The inspector shows its sizes, each with a source and a status: text-attested, measured or inferred.' },
  { id: 'docent', title: 'Ask the docent', spot: '.docent', state: { selected: 'counterweight-north', sheet: true },
    text: 'Ask anything. Answers cite their sources, and the docent says so when it cannot cite one.',
    run: () => { if (!asked.docent) asked.docent = type('form.ask input', 'How do the counterweights help the bascules open?', true) } },
  { id: 'search', title: 'Search', spot: '.search', state: { sheet: true },
    text: 'Find any part, event or source by name.',
    run: () => type('.search input', 'bascule'), leave: () => type('.search input', '') },
  { id: 'lidar', title: 'See the LiDAR', spot: '.toggles button:nth-child(2)', cam: [420, 90, 480], state: { lidar: true },
    text: 'The ground as the Environment Agency measured it: 1 m LiDAR, shown as a point cloud.' },
  { id: 'top', title: 'Top-down', spot: '.seg', state: { view: 'top' },
    text: 'The topography straight from above, with the parts labelled.' },
  { id: 'walk', title: 'Walk it', spot: '.seg', state: { view: 'walk' },
    text: 'Stand on the deck. W A S D or the arrow keys to walk, drag to look; on a phone, the arrow pad.' },
  { id: 'identify', title: 'Identify a photo', spot: '.id-open', when: () => !!document.querySelector('.id-open'),
    text: 'Upload a photo of the real bridge: Strata names the parts it can see, boxes them, and flies to where you stood.' },
  { id: 'reimagine', title: 'See it in another year', spot: '.rm-open:not(.id-open)', when: () => !!document.querySelector('.rm-open:not(.id-open)'),
    text: 'Captures this 3D view and turns it into a period photograph of the year on the slider, with a before and after slider.' },
  { id: 'voice', title: 'Talk to the docent', spot: 'button[aria-label="Talk to the docent"]', state: { sheet: true },
    when: () => !!document.querySelector('button[aria-label="Talk to the docent"]'),
    text: 'Press the mic and ask out loud; the docent answers by voice, with a live transcript.' },
  { id: 'next', title: 'Coming next', cam: [-230, 55, 200],
    text: "Stonehenge, Hadrian's Wall and the Tower of London: the same LiDAR ground, sourced history and docent. Now you try: tap any part.",
    last: true },
]

// Make the app show step `step`: its state over the defaults, its camera, its action.
export function applyStep(step) {
  const want = { ...DEFAULT, ...step.state }
  const st = s()
  if (want.view !== 'orbit') st.setView(want.view)
  else if (step.cam) st.flyTo(step.cam) // also returns the view to orbit, flying from wherever it was
  else if (st.view !== 'orbit') st.setView('orbit')
  if (step.stops) step.stops[0].run()
  else if (st.year !== want.year) st.setYear(want.year)
  if (st.exploded !== want.exploded) st.setExploded(want.exploded)
  if (st.lidar !== want.lidar) st.setLidar(want.lidar)
  if (st.selected !== want.selected) st.select(want.selected)
  st.setSheet(want.sheet && narrow())
  step.run?.()
}

export function startGuide() {
  stopTour()
  asked.docent = false
  const go = () => {
    s().setHelp(false)
    const steps = STEPS.filter((x) => !x.when || x.when())
    useGuide.setState({ active: true, i: 0, steps })
    applyStep(steps[0])
  }
  // wait for the place and the lazy photo tools (up to 5 s), so the optional steps are counted
  const t0 = performance.now()
  const wait = () => (s().place && (document.querySelector('.id-open') || performance.now() - t0 > 5000) ? go() : setTimeout(wait, 150))
  wait()
}

export function goTo(i) {
  const { steps, i: from } = useGuide.getState()
  if (i < 0 || i >= steps.length || i === from) return
  steps[from]?.leave?.()
  useGuide.setState({ i })
  applyStep(steps[i])
}

export function stopGuide() {
  const { steps, i, active } = useGuide.getState()
  if (!active) return
  steps[i]?.leave?.()
  useGuide.setState({ active: false })
  const st = s() // hand back a clean app, keeping the camera where it is
  if (st.view === 'walk') st.setView('orbit')
  st.setExploded(false); st.setLidar(false); st.setYear(THIS_YEAR); st.setSheet(false)
}
