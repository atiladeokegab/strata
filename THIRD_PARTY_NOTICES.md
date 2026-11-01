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

## Archive photographs

The real photographs in `web/public/archive/` come from Wikimedia Commons, at most 1280 px wide. Each is public domain, CC0 or CC BY-SA, and is credited on screen.

- `1892-frames.jpg`: The towers rise as bare steel frames, 1892. Sidney Alfred Beer / The National Archives UK. No known copyright restrictions. https://commons.wikimedia.org/wiki/File:Tower_Bridge_(nearly).jpg
- `1892-works.jpg`: The works from the river, walkways in place, 28 September 1892. Unknown photographer. Public domain. https://commons.wikimedia.org/wiki/File:Tower_bridge_works_1892.jpg
- `1894-cladding.jpg`: Stone cladding nearly finished, c. 1894. Unknown photographer / Rijksmuseum. [CC0](https://creativecommons.org/publicdomain/zero/1.0/). https://commons.wikimedia.org/wiki/File:Tower_Bridge_in_aanbouw_in_Londen,_RP-F-F16346.jpg
- `1894-opening.jpg`: Opening day, 30 June 1894. Valentine & Sons, in Cassier's Magazine. Public domain. https://commons.wikimedia.org/wiki/File:Cassier%27s_Magazine_-_The_Tower_Bridge,_London,_on_the_Opening_Day,_June_30,_1894.jpg
- `1896-photochrom.jpg`: Photochrom print, bascules closed, c. 1890–1900. Photochrom Print Collection / Library of Congress. Public domain. https://commons.wikimedia.org/wiki/File:Tower_Bridge,_III._(closed),_London,_England-LCCN2002696929.jpg
- `1919-u155.jpg`: Surrendered U-boat U-155 on show at the bridge, 1919. Unknown photographer / National Maritime Museum. No known copyright restrictions. https://commons.wikimedia.org/wiki/File:National_Maritime_Museum_-_U155_at_Tower_Bridge_(pd).jpg
- `1925-glass.jpg`: From a glass-plate slide, c. 1925. Zygmunt Szczotkowski. Public domain. https://commons.wikimedia.org/wiki/File:Tower_Bridge_~1925.jpg
- `1938-thames.jpg`: The Thames and the bridge, 1938. Fortepan / Nagy Gyula. [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). https://commons.wikimedia.org/wiki/File:Temze_foly%C3%B3_a_Tower_h%C3%ADddal._Fortepan_54191.jpg
- `1940-blitz.jpg`: Smoke from the docks on the first day of the Blitz, 7 September 1940. New York Times Paris Bureau Collection. Public domain. https://commons.wikimedia.org/wiki/File:London_Blitz_791940.jpg
- `1940-headlights.jpg`: Through the traces of car headlights in the blackout, 1940. Ministry of Information Photo Division. Public domain. https://commons.wikimedia.org/wiki/File:Looking_across_Tower_Bridge_through_the_traces_of_car_headlights,_1940._D715.jpg

The CC BY-SA 3.0 photograph (`1938-thames.jpg`) is shared under the same licence; the resized copy is CC BY-SA 3.0 too.
