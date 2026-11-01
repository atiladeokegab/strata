// Google Photorealistic 3D Tiles status, shared with the terrain (so the grounds never overlap) and the credit pill.
import { create } from 'zustand'
import { useStore } from '../../store'

export const useGoogle = create(() => ({
  status: 'loading', // loading | ready | failed (no key, or the Map Tiles API refused us)
  credit: '', // the copyright string Google requires on screen while its tiles are visible
}))

// Google is today's city: it steps aside for the LiDAR cloud and, before 2012, for the dated buildings on bare ground
// (the 1890s map before 1950). 2012 is the timeline's last event (tb-led-lighting-2012) and the Shard's completion
// (wiki-the-shard), so the towers in today's tiles do not stand in the 1960s.
export const HISTORIC_BEFORE = 1950
export const GOOGLE_FROM = 2012
export const useGoogleWanted = (lidar) => useStore((s) => s.year) >= GOOGLE_FROM && !lidar // hook first, never skipped

// True when the photoreal tiles are what the viewer sees (wanted and loaded); terrain and buildings hide while it is.
export function useGoogleShown(lidar) {
  const ready = useGoogle((s) => s.status === 'ready')
  return useGoogleWanted(lidar) && ready
}
