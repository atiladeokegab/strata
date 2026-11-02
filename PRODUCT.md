# Product

<!-- impeccable:product-schema 1 -->

Written 2026-11-02 as a retrofit on a live product (origin/main a89bcea). Facts come from the build
brief, the README, the retro and the code; nobody was interviewed. Lines marked *(inferred)* are the
designer's reading and can be corrected.

## Platform

web

## Users

Visitors, students and teachers who want to see how a landmark was built and how it works, not just
read about it. They arrive on a laptop or a phone, in daylight, often on the spot or in a classroom, with
a few minutes and no manual. *(inferred)* A second reader is a hackathon judge or a reviewer on a laptop at
a table, who decides in one look whether this is the same category project they have seen before.

## Product Purpose

History is text and flat photos; you cannot watch a landmark being built. Strata rebuilds a famous place
from the Environment Agency's 1 m LiDAR and its own sourced history, so a visitor can orbit it, look
down on the ground as it was measured, walk its deck, take the structure apart, work its machine, scrub
1886 to today, tap any part and ask a docent that cites its sources or refuses. Success is a visitor who,
inside a minute, has watched the bridge rise and the bascules lift and can say where one number came from.

First exhibit: Tower Bridge, London, with the Tower of London, the Thames and Shad Thames around it.

## Positioning

Data is law. Every number on screen carries a source and a status (text-attested, measured, inferred); a
number without a source fails validation, and the docent refuses what it cannot cite. The machine runs on
simulated state, not keyframes: the bascule angle comes from a hydraulic simulation and the traffic and
the ship read it. The ground is the real measured surface, 1 m LiDAR, not a stock terrain. A neighbouring
3D-landmark page can copy the look of a bridge; it cannot truthfully copy the sourcing, the simulation or
the survey.

## Operating Context

- Live on Cloud Run: https://strata-901257379404.europe-west2.run.app. A first visit opens the guided
  tour by itself; Skip tour, Esc and the ? button are the exits and re-entry.
- Surfaces: the Home stage (a museum of places), the app (a full-screen 3D stage with a side panel, a
  dock holding the year slider and the bascule control, view and toggle controls), the guided tour and the
  60 s story, the docent (typed and by voice), Reimagine, Identify.
- Phones and tablets get a bottom sheet with 44 px targets and a lite render tier; a fallback with the film
  link shows when WebGL is missing.
- The look is judged on GPU stills of the exact tag, never the VM's software GL (lesson 27).
- Built at the DevDay Community Hackathon London, 1 November 2026, by one person with a team of AI
  agents; the judges said they had seen the category before and asked for something that looks pretty first.

## Capabilities and Constraints

- Place data in one shape everywhere: `{id, name, location, parts, events, sources}`; part ids are the
  shared key between data, scene meshes, the inspector and the docent.
- 25 bridge parts, 9 places around it, 14 sourced events, 6 people, 8 docent facts, 24 sources (README).
  Towers 65 m; bascules lift to 86 degrees; built 1886 to 1894. Fast lift 17.3 s idle to idle (retro).
- Terrain: 1.5 km square of 1 m LiDAR with aerial drape; before 1950 the 1893 to 1896 OS London Town Plan
  on bare earth; 2,778 OSM footprints at LiDAR heights filtered by start date; Google 3D Tiles when keyed.
- Ten archive photographs 1892 to 1940, credited on screen.
- Views: orbit, top-down, walk. Exploded view, LiDAR point-cloud view, bascule drag handle.
- The information architecture and app layout are fixed for this design pass: other builders own the
  tour's card, labels and controls, and the 3D terrain. A direction changes palette, type, material of
  panels and chrome, radii, the landing composition and the voice.
- Terminology: place, part, source, status, event, year, docent, timeline, bascule, lift, exhibit, tour,
  story (see the surface brief's vocabulary).
- Undecided: whether more places ship (Stonehenge, Hadrian's Wall and the Tower of London are listed as
  coming next, with no data yet).

## Brand Commitments

- Name: Strata. Voice: plain verbs, numbers with their source, the docent says when it cannot cite.
- Attributions are binding and on screen: Environment Agency LiDAR (OGL v3), National Library of
  Scotland map (CC BY), OpenStreetMap (ODbL), Google tiles when shown, Esri imagery, Poly Haven, archive
  photographs by name.
- The current light theme (frosted white glass, pill buttons, Inter) was a hackathon-day restyle nobody
  reviewed; it is evidence of what the subject is, not a commitment.

## Evidence on Hand

- Real renders: `docs/img/hero.jpg`, `construction-1890.jpg`, `inspector.jpg`, `home.jpg`,
  `lidar-render.jpg`, `banner.png`. The 89 s film on the submitted Drive link.
- Real data: `data/places/tower-bridge.json`, validated; `scripts/validate.py`; poison tests.
- The docent benchmark: 8 models, `gpt-5.4-nano` cited 3 of 3 with a 0.42 s median first token
  (`docs/codex.md`).
- No testimonials, no visitor numbers, no customers. Do not invent any.

## Product Principles

1. Every number carries its source and status; the interface shows both, never only the number.
2. The scene leads; the chrome recedes. Nothing covers the bridge on either size.
3. One big action runs the main journey end to end: Take the guided tour.
4. Mechanisms are shown working, driven by state, never faked with a clip.
5. Real material only: real renders, real archive photographs, real maps, credited where they appear.

## Accessibility & Inclusion

44 px touch targets on phones and tablets are already a product rule; keep body text at 16 px on phones,
contrast at 4.5:1 or better, a visible focus ring in the palette, and reduced motion respected (the app
already honours `prefers-reduced-motion`).
