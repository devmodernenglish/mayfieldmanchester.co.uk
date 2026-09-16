# Mayfield V3

A clean-sheet build from the new **Mayfield Design** Figma file
(`93kuA4ZRlxM378LbOxiZ1E`), pages **Desktop** (`261:8641`), **Mobile**
(`281:15867`) and **Components** (`335:19743`), plus the 19-minute
walkthrough Loom, which turned out to carry two things the file alone did
not say.

No framework, no build step, no dependencies. Mobile-first.

Currently built: **the homepage**, and the component layer the rest of the
site is made of (nav, initial nav, menu, window, plate, benefit, button,
Instagram, footer). Republic, Park, Spaces and Contact are not built yet;
they reuse this component layer.

## What the Loom changed

Two decisions came from the walkthrough rather than the Figma file, and
neither is guessable from the frames:

**1. The accent colour is the weather, not the brand** (11:32). "Instead of
basing this on the date of the year... this is now based on weather rather
than time. If it's cloudy we go for green, sunny an orange, raining a blue,
snowing or frosty an ice teal" — plus a night mode that ignores weather once
the sun sets. That is why the Figma style is named `Weather/Overcast` and not
anything brand-ish, and it "gets carried over to the home page as well".

So the accent is one token repointed by `[data-weather]` on `<html>`, with
`[data-mode="night"]` inverting the page. Values are the Figma variables:

| State              | Token          | Value     |
| ------------------ | -------------- | --------- |
| Overcast (default) | `--c-overcast` | `#a6ff27` |
| Sunny              | `--c-sunny`    | `#ffb700` |
| Rain               | `--c-rain`     | `#69e3ff` |
| Frost              | `--c-frost`    | `#69ffe1` |
| Night              | `--c-night`    | `#121e3e` |

Review any of them with `?weather=sunny|rain|frost|overcast` and
`?mode=night` — a manual override always beats the live reading, so a state
can be looked at without waiting for the sky to cooperate.

### Where the state comes from

`/v2/api/weather` — a Cloudflare Pages Function (`functions/v2/api/weather.js`)
that proxies the Google Weather API's `currentConditions:lookup` for Mayfield
Park (53.4769, -2.2270) and reduces its **40 documented condition types** to
these five.

It is a Function rather than a `fetch()` from the page because the Google key
would otherwise be public in `motion.js`. Set it once:

```bash
npx wrangler pages secret put GOOGLE_WEATHER_KEY --project-name mayfield-26
```

**It is not set yet**, so the endpoint currently answers
`{"state":"overcast","mode":"day","source":"default"}` and the site sits on
the brand's own green. That is deliberate: an unavailable API leaves the page
on a colour the design chose, never on a failure state.

The mapping, and the three judgement calls in it:

| Condition types                                     | State    |
| --------------------------------------------------- | -------- |
| `CLEAR`, `MOSTLY_CLEAR`                             | sunny    |
| `PARTLY_CLOUDY`, `MOSTLY_CLOUDY`, `CLOUDY`, `WINDY` | overcast |
| all 12 rain types **+ 5 thunderstorm + 2 hail**     | rain     |
| all 14 snow types **+ `RAIN_AND_SNOW`**             | frost    |
| anything unlisted                                   | overcast |

- **Thunder and hail read as rain.** The palette has no fifth colour for them
  and blue is the honest reading of that sky.
- **`RAIN_AND_SNOW` reads as frost**, because the teal is the more distinctive
  of the two and sleet is the colder story.
- **Unknown types fall through to overcast**, so if Google adds a type the
  site looks deliberate rather than broken.

**Night is a separate axis, not a sixth condition.** It comes from the API's
`isDaytime` — which is Manchester's sky — rather than the visitor's clock, so
someone reading from another timezone sees Mayfield's actual night. The
trade-off is that with no key configured, night never triggers on its own.

The temperature readout and the icon in the nav and hero are both live from
the same call.

### Nothing is shown until it is known

The markup used to ship `19°` and a default cloud, which corrected themselves
the moment the API answered. That is a visible flicker, and for a beat the
page stated a temperature nobody had checked.

Both readouts now start empty and at zero opacity, and the time and the
weather fade in together once the call resolves — the clock is computed
locally and instantly, but it waits so the badge arrives as one thing rather
than assembling itself.

Three things keep that from becoming a worse bug than the flicker it replaces:

- The reveal runs in a `.finally()`, so it happens on success, on a bad
  response and on an outright network failure alike.
- A 3s `setTimeout` backstop covers a request that hangs rather than fails —
  the time should not be held hostage to the weather.
- The gate is scoped to `.js`, so nothing is hidden that JavaScript will never
  be around to reveal.

When there is no reading at all the temperature field stays **empty** rather
than falling back to a number. The icon still says what the sky is doing, and
silence is better than an invented figure.

### The weather glyphs

All five are drawn in Figma (Components page, `214:2236`): clear, night,
frost, cloudy, rain. The exports arrive wrapped in canvas furniture — a grey
section backdrop and the purple component-set boundary — so the build takes
only the `<g id="Condition=…">` group and rebuilds a clean 20x20 around it.

**Night takes the moon whatever the sky is doing.** In night mode the accent
is the dark navy rather than a weather colour, so the condition is not being
expressed by the palette either; the moon is what says it is night in
Manchester, and a sun after dark would simply be wrong.

**They are painted as a CSS mask, not loaded as `<img>`.** An external SVG in
an `<img>` cannot inherit `currentColor` — the same trap the wordmark fell
into — and these have to be black on the accent in the nav and white over
video in the hero. As a mask with `background-color: currentColor`, one asset
serves both and follows the text beside it. `motion.js` swaps a `--wx` custom
property rather than a `src`.

A `label` is still returned alongside `icon` as a safety net: an unmapped
state would say the condition in words rather than show nothing. With all five
drawn it is always `null`.

**2. The hero and the window are the same video** (01:12). "As the user
scrolls from this video background we scale this down... the user will be in
control of this track", landing on "a fixed centered video that layers with
images and text to create a window into the park". The hero is not a separate
element that fades to a panel — it shrinks into the panel's exact footprint,
which is why `--win-w` / `--win-h` are shared tokens rather than numbers in
two places.

## Type

**BDO Grotesk, self-hosted** — `assets/fonts/*.woff2`, two weights only
(Medium 500, ExtraBold 800), 49KB each, converted from the supplied family.
Licensed to be self-hosted: SIL Open Font License v1.1, commercial use
allowed (`assets/fonts/OFL.txt`).

Before the font arrived this fell back to `hagrid` from the Adobe kit — the
only kit family carrying both required weights. That is gone: **V2 loads no
Typekit at all.** Same-origin fonts with `font-display: swap` means none of
the third-party chain that cost V1 1,530ms of render-blocking time on mobile,
and the swap behaviour is ours to set rather than Adobe's.

Note the Park page uses a second face — **Stratos** Bold 700 for its titles
(`Park/Title 36/48/80/120`). Stratos _is_ in the Adobe kit, so that page will
need either the kit back or a self-hosted cut.

## The window

`position: fixed`, dead centre, for the whole page below the hero. The
collage plates pass **behind** it (z-index 10 vs 15); the white benefit
panels pass **in front** (z-index 20). That layering is the "window into the
park" — the video is only ever visible where the collage lets it be.

The hero → window transition runs on a **CSS scroll timeline**
(`animation-timeline: scroll(root block)`), not a scroll listener: it runs off
the main thread, scrubs backwards exactly rather than by reconstruction, and
leaks no listener. `motion.js` carries an equivalent JS path for browsers
without it (Firefox today), and stands down entirely where CSS can do the
job so the two never fight over the same inline styles.

## Details worth keeping

**The wordmark is inlined SVG, not `<img>`.** In Figma it is eight separate
vector letterforms; `assets/wordmark/mayfield.svg` composes them into one
path set at the Figma offsets. It must be inlined because an external SVG
cannot inherit `currentColor` — referenced as a file it rendered black
against the video instead of white.

**Text over video uses `--c-on-media`, not `--c-paper`.** They are the same
white in day mode, which hides the bug: night mode repoints `--c-paper` to
dark navy, which turned the hero wordmark navy-on-dark-footage.

**The benefit sections are 880px, not 480px.** The Figma component is 480,
but it does not sit flush: img1 ends at 1640 and the benefit starts at 1840;
the benefit ends at 2320 and img2 starts at 2520. That 200px of white on each
side is most of what gives the section its air.

**The word and video change when the BOX dips into the next section** — the
trigger is the fixed panel's own bottom edge, not the viewport. The active
section is the last one whose top edge has risen past `window.bottom - DIP`.

Two earlier rules were wrong about this and are worth recording, because both
are plausible and both feel wrong on the page:

| Rule                          | Switches at                  | Reads as                                                                              |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| Nearest the viewport middle   | section top hits centre      | swaps while the previous section still fills the screen                               |
| 100px scrolled into the panel | `sectionTop + 100`           | fires ~790px too late — the box is deep in the new section before the word catches up |
| **Box dips in** (current)     | `sectionTop − window.bottom` | the word turns over exactly as the panel touches the new section                      |

`DIP` is the commitment before the swap: 0 is first contact, raise it to make
the box travel further in first. Measured at 1102×897: the panel sits
209→689, the Explore plate starts at 3571, and the swap lands at scrollY
2883 — precisely `3571 − 689`.

Per-section footage rides the same trigger: give a zone `data-video="..."` and
the window swaps source with the word. Left off until the real cuts exist, so
today nothing changes hands.

## The menu

Built from the screen recording, because the Figma frames only show the end
state. **The nav bar and the menu are one element.** The green box grows from
`--nav-h` (36px) to the full viewport, and the wordmark is pinned to its
bottom edge the whole way — so what looks like the logo being "pulled down and
expanded, then pinched and shrunk back" is literally one element, never a
handover between two.

Everything derives from a single registered custom property:

```css
@property --menu-p {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}
:root {
  --menu-p: 0;
  transition: --menu-p var(--dur-menu) var(--ease-menu);
}
:root.menu-open {
  --menu-p: 1;
}
```

The box height, the wordmark's scale, its inset from the bottom edge and the
links' opacity are all `calc()`s on that one value. One transition drives the
lot, so nothing can outrun anything else — the mark's position is defined BY
the edge.

**This replaced three earlier attempts, and the failure mode is worth
recording.** The first versions had the bar and the menu as separate elements
with the wordmark duplicated between them, animated by separate transitions
that were _tuned_ against each other. That can only ever be approximately
right, and it failed in both directions: matched durations let the retracting
green edge overtake the mark and drop it onto the white page; making the mark
faster left a void of green beneath it. Tuning two clocks cannot fix a problem
that is structural. Deriving one from the other can.

Measured across a full open, the gap between the wordmark and the green edge:

| Box height  | 36   | 148  | 547  | 822  | 897  |
| ----------- | ---- | ---- | ---- | ---- | ---- |
| Mark width  | 88   | 206  | 627  | 917  | 996  |
| Gap to edge | 11.0 | 11.6 | 14.0 | 15.6 | 16.0 |

The only movement in that gap is the deliberate `--mark-inset` interpolation
(11px at bar size, so an 88px centred wordmark lands exactly where the bar's
one sits). Closing traces the same numbers backwards, and the mark is inside
the box at every frame.

`--seat-s` is the one value CSS cannot work out for itself — the wordmark's
bar width over its full width, which depends on the viewport. motion.js
measures it once and on resize, from `offsetWidth` rather than
`getBoundingClientRect`, or the current scale would compound into the reading.

Other things that were wrong on the way, all visible only once it moved:

- **The wordmark is the composed SVG, not live type.** A `vw` font-size is a
  guess: at 23vw the D fell off the right edge and the letterforms overlapped
  the legal row beneath.
- **The link columns are a grid with `align-content: center` and
  `align-items: start`.** A flex row pinned them to the top of the panel over
  the temp readout; without `align-items: start` the three-item column centred
  itself against the two-item ones and floated "What's here" above "Home".
- **The links fade out in 260ms against the box's 860ms.** They ride the box,
  so without an early fade they slide out under the browser chrome.
- **`--mark-inset-open` is breakpoint-aware** (42px mobile, 16px up): on mobile
  the wordmark has to clear the legal row beneath it, which up is the fourth
  link column instead.

## Link hover

A rule that enters from whichever side the pointer crossed and leaves by the
opposite one, so it reads as passing through the word rather than rewinding.
**The type itself does not move.** An earlier pass split the label into
characters and lifted them on a stagger; it read as jumpy, so the split is
gone entirely — which also removed the DOM-rewrite-under-the-cursor hazard
that made V1's version fragile.

Hand-built, not GSAP. There is no GSAP "underline library" — V1 used GSAP plus
SplitText for this, which is ~78KB for what is now about 40 lines of CSS and a
single delegated listener. V2 stays dependency-free.

Two things carried over from V1 because they are easy to get wrong:

- **`width: fit-content` on the link.** These are block-level inside the menu
  and footer columns, so their box is the full column width while the word is
  much shorter. The rule is `left: 0; right: 0`, so without this it stretches
  the whole column and fires when you hover the empty space beside a short
  word. Verified: bar width equals text width exactly on every link.
- **Delegated `pointerover`, not `pointerenter` per link.** Those do not
  bubble, and any missed leave strands a drawn rule under a link nobody is
  touching. Verified: zero stray bars after the pointer leaves.

## Still to do

- Republic, Park (5 weather states + night), Spaces, Contact pages.
- Real video: the hero currently reuses V1's footage as a placeholder. The
  brief asks for "something that represents the whole of Mayfield", and a
  separate cut for the Play section.
- Wire `[data-weather]` to a real forecast for Manchester.
- Menu: the walkthrough wants the MAYFIELD word to scale up into the overlay
  and the links to arrive individually; currently it is a straight fade.
