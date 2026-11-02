// How the city's tiles load. The library default, loadAncestors, holds a used tile's whole subtree back until its coarse
// ancestor has loaded; on live the ancestor landed after its subtree had filled the cache, was discarded, then refused for
// good (every cached tile was in use), so 351 tiles sat in the cache and none drew (load.test.js reproduces it). Without it,
// each tile draws once it loads and a full cache costs a hole, never the city.
export const TILE_LOADING = { loadAncestors: false }
