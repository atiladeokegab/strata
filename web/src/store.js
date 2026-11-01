// The shared app state (contract in the build brief). Scene meshes are named by part id; clicking one calls select(partId).
import { create } from 'zustand'

export const FIRST_YEAR = 1886
export const THIS_YEAR = new Date().getFullYear()

export const useStore = create((set) => ({
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
  setView: (view) => set({ view }),
  year: THIS_YEAR, // FIRST_YEAR..THIS_YEAR
  setYear: (year) => set({ year }),
  exploded: false,
  setExploded: (exploded) => set({ exploded }),
  bascule: 0, // 0 closed .. 1 fully open
  setBascule: (bascule) => set({ bascule: Math.min(1, Math.max(0, bascule)) }),
}))

export default useStore
