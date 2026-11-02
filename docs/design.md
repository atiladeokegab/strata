# Strata design: intent, UX and the first screen

For everyone building on Strata. The product record is `PRODUCT.md`; the surface strategy is
`.impeccable/surfaces/web.md`; this is the same content in plain words. The look (palette, type, tokens)
is decided by a blind judge from specimens and lands in the surface brief's direction contract, then in
`DESIGN.md` and `tokens.css`.

## What Strata is, in one line

History is text and flat photos. Strata lets you watch Tower Bridge being built, from real LiDAR and its
own sourced history.

## Who it is for

Visitors, students and teachers, on a laptop or a phone, in daylight, with a few minutes. Also a judge or
reviewer who has seen 3D-landmark projects before and decides in one look. Last time the judges said ours
was better engineered and asked for something that looks pretty first.

## The one feeling and the one memorable thing

- **Feeling:** standing on measured ground. Everything on screen is real: the surface, the map, the
  numbers, the photographs.
- **Memorable:** the river and the bridge on the real LiDAR, and a number that shows where it came from
  (65 m, text-attested, source). Nobody else's bridge does that.

## Modes

| Region | Mode | Meaning for builders |
|---|---|---|
| Landing and guided tour | Persuade | Bold, one line, one button; the picture is the product |
| The 3D scene | Experience | The bridge leads; chrome recedes; nothing covers it |
| Panel, dock, controls, docent | Operate | Scannable, consistent, 44 px targets, native expectations |

## Journeys

1. First visit: landing → Take the guided tour → eight steps → "Now you try" → tap a part.
2. Curious: landing → Enter Tower Bridge → 1890 → exploded → bascules → ask the docent.
3. On the spot: phone → Identify a photo → parts named → tap one.

## The first screen

The still of the bridge takes more than half the desktop width. Beside or over it: Strata, the one line,
the button **Take the guided tour**, the link Enter Tower Bridge, and the real numbers in the direction's
own form. On a phone the still sits in a clear band above the fold with the line and the button under it.
No card ever covers the bridge.

## Hierarchy

Landing: still, name and line, button, numbers, coming places (one line each, no cards). App: scene, dock
(year, event, bascule), panel (place, search, parts, inspector, docent), controls, attribution. Tour card:
caption, title, Next, Back, Skip, dots.

## States

- Loading: first frame plus one line ("Loading the LiDAR ground, 1.5 km of it"); never a spinner alone.
- Empty inspector: "Tap any part of the bridge, or pick one above. Each figure shows its source and status."
- Docent offline: "The docent is offline. The parts, sources and timeline still work."
- Refusal: a calm message in the citation chip's style.
- No WebGL: the film link in the same chrome.

## Vocabulary

place, part, source, status (text-attested, measured, inferred), event, year, timeline, docent, bascule,
lift, exploded view, LiDAR, top-down, walk, exhibit, guided tour, the 60 s story. Buttons say what
happens. Sentence case. Never "explore", "discover", "immersive", "journey".

## The guided tour in story order

1. The problem (0 to 6 s): "History is text and flat photos. This is Tower Bridge on the ground the
   Environment Agency measured, 1 m at a time."
2. Watch it being built (wow by 10 s): 1886 to 1894, stage by stage.
3. Watch it work (one number by 20 s): the leaves rise to 86 degrees on simulated hydraulics; a ship through.
4. Take it apart: exploded view.
5. Tap any part: 65 m, text-attested, its source.
6. Ask the docent: a cited answer; it says so when it cannot cite.
7. The ground: top-down LiDAR, coloured by height.
8. Now you try: tap any part. Skip is visible at every step.

## Decisions taken without asking

The landing is the app's first state. The current light theme is not a commitment. Only README numbers
appear on the first screen. The tour is the main action. Coming places are lines, not cards. The direction
does not touch the 3D materials; it reaches the scene only through tokens (page under the canvas, label
type).

## The direction

**D2 Survey: the ground as data.** The blind judge ranked it first of the four specimens (one tell,
18/24, above the standard card) and the design pass picked it too. The LiDAR ground is the hero; every
figure carries its status as a dot and a word; the year slider is a measured scale; a height legend runs
the full height of the still. Light theme only: the scene is a daylight survey.

- Colour: survey ochre (`#A67C00`) for the one action and the live year mark, cool instrument greys,
  matte paper panels with one hairline. Status: measured in green, text-attested in blue, inferred in
  grey, always with the word. The height ramp is the one gradient, and only where it encodes height.
- Type: Geologica for headings, Public Sans for everything else, self-hosted; base 16, ratio 1.25;
  tabular figures.
- Shape: radii 4 (controls), 8 (panels), pill only for status chips; spacing 4 to 32; controls 44 px.
- Over the live scene: the panel, dock and docent are opaque paper, never glass, blur or shadow, and
  never on the subject. At desktop the panel is a side sheet beside the canvas and the dock a strip
  below it; attribution sits under the picture, never on it. On a phone the attribution sits below the
  still band. The judge failed the specimen on exactly this, so it is a rule.
- Motion: one moment, the still crossing from the aerial drape to the point cloud; off under
  reduced motion.
- Leaves out: glass, blur, shadows, other gradients, serif, filled chips, dark mode, stat tiles, cards
  over the scene, eyebrow labels.

The full contract, the tokens and the voice (one line and three Do/Don't pairs from the subject) are in
the surface brief; `web/src/tokens.css` is generated from its frontmatter and never hand-edited.
