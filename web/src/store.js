// The shared app state (contract in the build brief). Scene meshes are named by part id; clicking one calls select(partId).
import { create } from 'zustand'

export const FIRST_YEAR = 1886
export const THIS_YEAR = new Date().getFullYear()
// ?embed=1: the bare scene for iframes (atilade.uk): hero view, slow auto-orbit, credit and an "open the full app" link only
export const EMBED = new URLSearchParams(globalThis.location?.search ?? '').get('embed') === '1' // node (check.mjs) has no location
// ?tiles=0 (filming): Google's photoreal tiles never load, in any era; our LiDAR ground and buildings show, and no Google credit
export const TILES = new URLSearchParams(globalThis.location?.search ?? '').get('tiles') !== '0'

export const useStore = create((set) => ({
  sheet: false, // phone/tablet: bottom sheet expanded
  setSheet: (sheet) => set({ sheet }),
  help: false, // the How to use card
  setHelp: (help) => set({ help }),
  place: null, // {id, name, location, parts, events, sources} from GET /api/places/{id}
  setPlace: (place) => set({ place }),
  loadPlace: async (id) => {
    const r = await fetch(`/api/places/${id}`)
    if (!r.ok) throw new Error(`place ${id}: ${r.status}`)
    set({ place: await r.json() })
  },
  selected: null, // part id or null
  select: (id) => set({ selected: id }),
  view: 'orbit', // orbit | top | walk
  cameraTo: null, // [x,y,z] fly request; CameraRig flies there, looking at the bridge, then clears it
  flyTo: (pos) => set({ cameraTo: pos, view: 'orbit' }),
  frameShift: null, // [x, y] px from the canvas centre: the guided tour's clear spot beside its card; CameraRig aims its flights there
  setView: (view) => set({ view }),
  year: THIS_YEAR, // FIRST_YEAR..THIS_YEAR
  setYear: (year) => set({ year }),
  exploded: false,
  setExploded: (exploded) => set({ exploded }),
  lidar: false, // show the terrain as the raw LiDAR point cloud
  setLidar: (lidar) => set({ lidar }),
  sceneReady: false, // first lit frame with the bridge in it (scene/Look.jsx FirstFrame); photo textures start then
  setSceneReady: (sceneReady) => set({ sceneReady }),
  sceneSettled: false, // terrain, textures, bridge and Google's first view all in (ui/SceneLoading.jsx); the loading card lifts
  setSceneSettled: (sceneSettled) => set({ sceneSettled }),
  docentBusy: false, // an answer is loading (ui/Panel.jsx); the guided tour waits on it
  setDocentBusy: (docentBusy) => set({ docentBusy }),
  bascule: 0, // 0 closed .. 1 fully open
  setBascule: (bascule) => set({ bascule: Math.min(1, Math.max(0, bascule)) }),
}))

export default useStore
