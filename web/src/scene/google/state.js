// Google Photorealistic 3D Tiles status, shared with the terrain (so the grounds never overlap) and the credit pill.
import { create } from 'zustand'

export const useGoogle = create(() => ({
  status: 'loading', // loading | ready | failed (no key, or the Map Tiles API refused us)
  credit: '', // the copyright string Google requires on screen while its tiles are visible
}))

// True when the photoreal tiles are what the viewer sees (LiDAR off and the tiles loaded).
export const useGoogleShown = (lidar) => useGoogle((s) => s.status === 'ready') && !lidar
