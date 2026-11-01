<p align="center"><a href="https://strata-901257379404.europe-west2.run.app"><b>▶ Open the live app: https://strata-901257379404.europe-west2.run.app</b></a></p>

<p align="center">
  <img src="docs/img/banner.png" alt="Strata: a live render of Tower Bridge over the Environment Agency LiDAR point cloud, coloured by height" width="100%">
</p>

<p align="center">
  <a href="https://platform.openai.com/"><img alt="OpenAI" src="https://img.shields.io/badge/OpenAI-docent%20%C2%B7%20search%20%C2%B7%20image%20%C2%B7%20vision%20%C2%B7%20realtime-412991?logo=openai&logoColor=white"></a>
  <a href="https://threejs.org/"><img alt="three.js" src="https://img.shields.io/badge/three.js-R3F-000000?logo=threedotjs&logoColor=white"></a>
  <a href="https://surrealdb.com/"><img alt="SurrealDB" src="https://img.shields.io/badge/SurrealDB-graph-FF00A0?logo=surrealdb&logoColor=white"></a>
  <a href="https://fastapi.tiangolo.com/"><img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi&logoColor=white"></a>
  <a href="https://environment.data.gov.uk/survey"><img alt="Environment Agency LiDAR" src="https://img.shields.io/badge/LiDAR-Environment%20Agency%201%20m-00703C"></a>
  <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"><img alt="Open Government Licence v3" src="https://img.shields.io/badge/data-OGL%20v3-1d70b8"></a>
</p>

<h3 align="center">History is text and flat photos. You can't watch a landmark being built.</h3>

<p align="center">Strata rebuilds famous places from real LiDAR and their own sourced history, for visitors, students and teachers.</p>

<p align="center">
  <a href="https://strata-901257379404.europe-west2.run.app"><img alt="Try Strata live" src="https://img.shields.io/badge/%E2%96%B6%20Try%20it%20live-strata.run.app-00A86B?style=for-the-badge"></a>
  &nbsp;
  <a href="https://drive.google.com/file/d/1uNi3PW-jJgSrKpRLj1RA3SoMRMLxtWnQ/view?usp=sharing"><img alt="Watch the 90 s demo" src="https://img.shields.io/badge/%F0%9F%8E%AC%20Watch%20the%2090%20s%20demo-Google%20Drive-1d70b8?style=for-the-badge"></a>
</p>

<p align="center"><b>Live app:</b> <a href="https://strata-901257379404.europe-west2.run.app">https://strata-901257379404.europe-west2.run.app</a></p>

### Try it in 60 seconds

1. On a first visit the guided tour opens by itself: **Next** and **Back** step through every feature, each one live.
   - **Skip tour**, top right of the card, ends it at any step and drops you into the app.
   - **Esc** does the same from the keyboard.
   - **?** (top right of the app) then **Take the guided tour** starts it again; **Play the 60 s story** is the hands-off version.
2. Drag to orbit the bridge.
3. Scrub the timeline from 1886 to today.
4. Tap any part, then ask the docent, for example "How do the bascules open?"
5. Try the **Exploded**, **Top** and **Walk** buttons.

### Built with Codex

- **Atlas:** the sourced history graph and a validator that rejects unsourced numbers (`c0b7ed8`).
- **Prometheus:** the cited docent, after a benchmark of 8 candidate models (one was unavailable). `gpt-5.4-nano` cited 3 of 3 answers correctly, with a 0.42 s first token.
- The full log, with session ids: [docs/codex.md](docs/codex.md).

<p align="center">
  <img src="docs/img/hero.jpg" alt="Strata in the browser: Tower Bridge on the Thames among the surrounding buildings, with the frosted side panel, the parts list, the docent and the timeline" width="100%">
</p>

<!-- TODO(demo): record the demo and drop it at docs/img/demo.gif, then uncomment.
<p align="center"><img src="docs/img/demo.gif" alt="Strata demo: flying over Tower Bridge, opening the bascules, scrubbing 1886 to today" width="100%"></p>
-->

## Who it's for

Visitors, students and teachers who want to see how a landmark was built and how it works, not just read about it.

You can read that Tower Bridge took eight years to build, that its towers stand 65 m tall and that its bascules lift to 86 degrees. Strata lets you watch it: the piers going in, the steel frames rising, the stone going on, and the leaves lifting on the hydraulics that still power them. Every number on screen has a source, and the docent refuses what it can't cite.

First exhibit: **Tower Bridge**, London.

## Everything you can try

**Live:** [strata-901257379404.europe-west2.run.app](https://strata-901257379404.europe-west2.run.app)

1. You land in a museum of places, with Tower Bridge turning under a spotlight. Press **Play the 60 s story** for a captioned tour of every feature, or **Enter Tower Bridge** to explore. Add `?tour=1` to the link to start the story straight away.
2. Drag to orbit and scroll to zoom, or switch to **Top** or **Walk** at the top right. Press **LiDAR** to see the ground as the raw Environment Agency point cloud, coloured by height. The **?** button explains the controls.
3. Tap any part of the bridge, or pick one from the panel. The camera flies to it and the inspector shows each figure with its source and status.
4. Press **Exploded** to take the bridge apart and look inside the towers. Raise the **Bascules**, or drag a leaf, and watch the traffic stop at the gates and the ship downstream wait, then sail through.
5. Drag the timeline back to 1890. The ground turns into the 1893 to 1896 Ordnance Survey map laid on bare earth, with today's buildings removed and only those standing by 1894 left. The site works, rigs, barges and scaffold come and go stage by stage, archive photographs appear for the year, and the ticks on the timeline open the story of each event.
6. Ask the docent, for example "How do the bascules open?" or "How heavy is a bascule?", by typing or by voice.
7. Press **See it in** a year to have the view repainted as a period photograph, or **Identify a photo** to have the parts in a real photo of the bridge named.

<table>
  <tr>
    <td width="33%"><img src="docs/img/home.jpg" alt="The Home stage: a museum of places, with Tower Bridge on a plinth, Play the 60 s story, and the places coming next"></td>
    <td width="33%"><img src="docs/img/inspector.jpg" alt="The north tower selected: the inspector shows its 65 m height, text-attested, with its source and an archive photograph"></td>
    <td width="33%"><img src="docs/img/construction-1890.jpg" alt="The timeline at 1890: a tower's steel frame rising inside its scaffold, with a crane overhead, on the bare-earth 1890s Ordnance Survey map"></td>
  </tr>
  <tr>
    <td align="center">A museum of places</td>
    <td align="center">Every figure has a source and a status</td>
    <td align="center">1890: the frames rise on the old map</td>
  </tr>
</table>

## What we built today

Everything in this repo was built at the DevDay Community Hackathon London on 1 November 2026, by one person working with a team of AI coding agents.

- **The terrain:** 1.5 km square of real Environment Agency 1 m LiDAR around the bridge, draped with aerial imagery, with a raw point-cloud view and the Thames at its surveyed level.
- **1890, on bare earth:** before 1950 the modern buildings are taken out of the LiDAR surface and the ground becomes the 1893 to 1896 OS London Town Plan, in its own colours on warm paper.
- **The city around it:** Google Photorealistic 3D Tiles when a key is set, otherwise OpenStreetMap footprints raised to their LiDAR heights. Before 1950 only buildings with a start date of 1894 or earlier stand. Nine nearby places, from the Tower of London to HMS Belfast, are pinned by the years they stood.
- **The app shell:** a light theme with frosted white glass and pill buttons; a museum-of-places Home stage; a side panel with the place card, search, part inspector and docent; orbit, top-down and walk views; fly-to-part; a timeline with story markers and sourced story cards; a phone and tablet bottom sheet with 44 px touch targets; a lite tier for phones and small laptops; and a fallback with the film link when WebGL is missing.
- **The bridge:** a procedural Tower Bridge whose meshes are named by part id, from the towers' parapets, pinnacles and turrets down to the bascule girders, chains and anchor plates. It explodes into its parts, and its cladding x-rays to show the steel frame.
- **The interiors:** the Victorian stairs and hydraulic lifts inside the towers.
- **The machine:** bascules driven by a weighted-accumulator hydraulic simulation, with a live readout, power flowing along the hydraulic mains, a drag handle on each leaf that works the operator's lever, road traffic held by gates and signals at each bascule, the 1894 hydraulic engine house on the south bank, and its 1976 electro-hydraulic changeover.
- **The river:** the ship changes with the year: a three-masted barque from 1894, a steam tug towing a lighter from 1930, a motor coaster from 1970, and a Thames Clipper from 1999. Each waits downstream until the leaves are up, then sails through. A Clipper is low enough to pass under the closed deck, and era small craft yield to the big vessel. Before 1950, lighters and sailing barges lie moored in tiers along the Pool of London.
- **The construction stages and works:** the bridge rises from 1886 to 1894 with the period's site works around it: staging, a piling rig, barges, derricks, centring, cradles and scaffold.
- **Top view:** part callouts with leader lines, a 50 m scale bar, a north arrow and the bascules' swing envelopes.
- **The look:** a Poly Haven HDRI sky and matched sun, fitted soft shadows, haze, and a post stack with a period colour grade by year.
- **The history:** 25 bridge parts, 9 places around it, 14 sourced events, 6 people, and 8 docent facts (the bascule weight, why the bridge is painted blue, horse traffic, the 1976 switch to electric power and more) from 24 sources, held in a SurrealDB graph served by `GET /api/places/{id}`, with a validator (`scripts/validate.py`) and poison tests that fail any number without a source.
- **The streaming docent:** `POST /api/ask`. Answers stream into the chat with citation chips for every fact, and it refuses questions it can't source.
- **Search:** `GET /api/search`, semantic search over parts, events and sources.
- **Reimagine:** "See it in" a year repaints the 3D view as a period photograph, with cached views for 1894, 1944 and today in a Then and now strip.
- **Identify:** upload a real photo of the bridge, or pick one of three samples, to have its parts named and boxed, and to see where the photographer stood.
- **Voice:** talk to the guide out loud.
- **From the archive:** 10 real photographs of the bridge from 1892 to 1940, matched to the year on the timeline and credited on screen.
- **The 60 s story:** a captioned tour of every feature in 59.5 s: the build from 1886, a fast lift, the LiDAR top-down view and a live docent answer with its citation chip, then it hands you the controls.
- **The deploy:** a multi-stage Docker build, live on Cloud Run.

## OpenAI models

| Feature | Model | What it does |
|---|---|---|
| Docent | `gpt-5.4-nano` | Streams answers from at most four retrieved facts, cites each one, and refuses anything unsourced. Chosen by a benchmark: 3 of 3 answers cited correctly and the fastest first token, 0.42 s median (see [docs/codex.md](docs/codex.md)). |
| Search | `text-embedding-3-small` | Embeds the exhibit's parts, events and sources once at startup, for semantic search. |
| Reimagine | `gpt-image-2.5-flare` | Repaints a capture of the 3D view as a photograph of the chosen year. |
| Identify | `gpt-6.1-terra` and `gpt-6.1-sol` | Names the parts in a real photo. The fast model and the careful one race, and the fast answer wins when its camera agrees with the towers. |
| Voice | `gpt-realtime-2.1` | A spoken conversation with the guide. |

## Use of Codex

Two of the agents that built Strata ran on Codex. One concrete example: Atlas, on Codex, built the history graph and its validator. Every mocked test passed, but its first run against a live SurrealDB caught a `RELATE` syntax error the mocks had missed. Codex fixed it, then checked exact readback of Unicode, quotes and colons, and made reseeding idempotent.

The full log, with session ids, commits and the docent model benchmark, is in [docs/codex.md](docs/codex.md).

## Data is law

Every number in Strata has a source and a status:

| Status | Meaning |
|---|---|
| `text-attested` | Stated in a cited source |
| `measured` | Measured by us from data, such as the LiDAR surface |
| `inferred` | Derived from other sourced figures, with the reasoning recorded |

A number without a source fails validation. The docent follows the same law: no citation, no answer.

This idea comes straight from **[Mechanica](https://github.com/Caleb0796/mechanica)** (MIT), which rebuilds historic machines under the rule that data is law and mechanisms run on simulated state. Strata takes that rule out of the workshop and onto a real map.

## How it's built

```mermaid
flowchart LR
  subgraph Browser
    W["Web app<br/>React Three Fiber + three.js"]
    GT["Google 3D Tiles<br/>(optional)"]
  end
  subgraph Server
    A["FastAPI<br/>places, search, ask, reimagine, identify, voice"]
    G[("SurrealDB<br/>place, part, source, event graph")]
    O["OpenAI<br/>docent, embeddings, image, vision, realtime"]
  end
  subgraph Offline
    L["Asset scripts<br/>EA 1 m DSM, Esri imagery,<br/>NLS 1890s map, OSM buildings"]
    T["Static assets<br/>terrain, buildings, archive"]
  end
  W -->|fetch, SSE| A
  A --> G
  A --> O
  L --> T
  T -->|static files| W
  GT -.-> W
```

- **Scene frame:** metres, origin at the centre of the bridge deck at road level, x east, y up, z south. Measured from the LiDAR, the origin sits at OSGB36 E 533670.3, N 180265.1, and the bridge axis runs 20.95 degrees off grid north.
- **Part ids are the shared key.** Scene meshes are named by part id, and clicking a mesh selects that part in the inspector and the docent.
- **Place data** follows one shape everywhere: `{id, name, location, parts, events, sources}`, served from SurrealDB when `SURREAL_URL` is set, with the validated JSON file as the fallback.
- **Mechanisms run on state, not keyframes.** The bascule angle comes from the hydraulic simulation, and the traffic and the ship read it.

## Coming next

- More places. The Home stage already lists Stonehenge, Hadrian's Wall and the Tower of London.

## Setup

You need [uv](https://docs.astral.sh/uv/) and Node 20 or later.

```bash
uv sync
(cd web && npm install)

make dev                 # API on http://localhost:8090
(cd web && npm run dev)  # web app on http://localhost:5173, proxies /api to :8090
```

Everything except the AI features runs with no keys. For those, put `OPENAI_API_KEY` in `.env`, which is gitignored. Without it the docent refuses and search falls back to keywords.

Optional:

- **SurrealDB graph:** set `SURREAL_URL` (and `SURREAL_USER`, `SURREAL_PASS` if needed), then seed it with `uv run python -m server.graph`. Without it the API serves the validated JSON.
- **Google 3D tiles:** set `GOOGLE_TILES_KEY`. Without it the OpenStreetMap buildings show instead.

Checks: `make smoke` runs the Python tests, and `uv run python scripts/validate.py` validates the place data. `make web` builds the web app, and `make deploy` deploys to Cloud Run.

## Credits

Existing code, data and ideas this project stands on. File-by-file detail and licence texts are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

- **[Mechanica](https://github.com/Caleb0796/mechanica)** (MIT, commit `27b5f8b`): the idea that data is law, sourced numbers with a status, and mechanisms driven by simulated state. Adapted code: the ACES grade and haze, the procedural PBR textures, the museum Home stage, the tour's part close-up, the bascule drag handle, and the docent's sourcing and refusal contract.
- **Environment Agency LiDAR:** LiDAR Composite DSM, 1 m. © Environment Agency copyright and/or database right. [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). For the terrain and the point cloud.
- **OpenStreetMap:** © OpenStreetMap contributors, [Open Database Licence (ODbL)](https://opendatacommons.org/licenses/odbl/), for the building footprints, raised to their LiDAR heights.
- **Google Photorealistic 3D Tiles:** © Google and its data providers. The attribution shows on screen whenever the tiles do.
- **Aerial imagery:** Esri World Imagery, © Esri, Maxar, Earthstar Geographics and the GIS User Community, under the Esri World Imagery terms of use.
- **Sky and light:** [Poly Haven](https://polyhaven.com/a/evening_road_01_puresky) `evening_road_01_puresky`, CC0.
- **Textures:** PBR sets from [Poly Haven](https://polyhaven.com) by Rob Tuytel, Dimitrios Savva and Dario Barresi, CC0; listed in THIRD_PARTY_NOTICES.md.
- **Historic map:** OS London Town Plan, five feet to the mile, 1893 to 1896. Reproduced with the permission of the [National Library of Scotland](https://maps.nls.uk/) (CC BY), draped on the bare-earth ground before 1950.
- **Archive photographs:** 10 photographs from Wikimedia Commons (public domain, CC0 and CC BY-SA 3.0), credited on screen and in THIRD_PARTY_NOTICES.md.
- **History and dimensions:** each figure cites its own source in `data/places/tower-bridge.json`.
- **Identify samples:** three photographs from Wikimedia Commons (CC BY-SA 4.0 and CC BY 2.0), credited on screen and in THIRD_PARTY_NOTICES.md.
- **3D:** [three.js](https://threejs.org/) (MIT), [React Three Fiber](https://github.com/pmndrs/react-three-fiber) (MIT), [drei](https://github.com/pmndrs/drei) (MIT), [3d-tiles-renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS) (Apache 2.0), [postprocessing](https://github.com/pmndrs/postprocessing) (Zlib), [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing) (MIT) and [N8AO](https://github.com/N8python/n8ao) (ISC).
- **Type:** [Inter](https://rsms.me/inter/), SIL Open Font Licence 1.1, from Google Fonts.
- **Web and server:** [React](https://react.dev/), [Vite](https://vite.dev/), [zustand](https://github.com/pmndrs/zustand), [FastAPI](https://fastapi.tiangolo.com/), [SurrealDB](https://surrealdb.com/) and the [OpenAI Python SDK](https://github.com/openai/openai-python).
- **Our own assets:** the banner and screenshots are headless renders of the app (the banner's title is laid over a render in `docs/img/banner.html`); the water normal map is generated by `scripts/terrain/build.py`; the cached Reimagine photographs were generated with OpenAI's image model from our own renders.

---

<p align="center">Built at the DevDay Community Hackathon London, 1 November 2026.</p>
