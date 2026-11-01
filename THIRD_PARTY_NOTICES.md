# Third-party notices

Strata includes code adapted from the projects below. Each keeps its own licence.

## Mechanica

- Source: https://github.com/Caleb0796/mechanica, commit `27b5f8b`
- Licence: MIT
- Adapted in Strata:

| Strata file | Adapted from (Mechanica) | What |
|---|---|---|
| `web/src/scene/Look.jsx` | its scene environment and "dusk-west" light rig | Light rig, ACES grade and haze |
| `web/src/scene/look/textures.js` | `src/core/textures.ts` and its geometry warmup | Seeded procedural PBR texture sets, idle-slice warmup |
| `web/src/ui/home/Home.jsx` | `src/ui/HomeCarouselHero.tsx` | Museum light rig, light pool, plinth and turntable drift |
| `web/src/scene/Tour.jsx` | `src/ui/viewer/DemoFocusRig.tsx` | Part close-up and the controls hand-off |


```
MIT License

Copyright (c) 2026 Mechanica contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
