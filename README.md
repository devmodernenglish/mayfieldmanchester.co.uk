# Mayfield Manchester

Marketing site for Mayfield, Manchester. Static HTML, CSS and vanilla JS with no framework, plus three Cloudflare Pages Functions.

Live at republicofmayfield.com, on the Cloudflare Pages project `mayfieldmanchester-co-uk`.

## Pages

| File | Page |
| --- | --- |
| `src/index.html` | Home |
| `src/park.html` | Mayfield Park |
| `src/republic.html` | The Republic (office building) |
| `src/spaces.html` | Experience (venues in the district) |
| `src/contact.html` | Contact |

Styles are in `src/css/`: `tokens.css` (variables), `base.css` and `components.css`. All the behaviour is in `src/js/motion.js`.

## Running locally

You need Node and Python 3 with Pillow (`pip install -r requirements.txt`).

```bash
npm run build                                  # src/ → dist/
npx wrangler pages dev dist --port 8788        # site + /api functions
```

`npm run dev` serves `dist/` without the functions, so the weather, reviews and contact form won't work in that mode.

## Build

`build.sh` copies `src/` into `dist/`. It also converts the `insta-*` and `home-*` PNGs to JPGs and rewrites the HTML to point at them. `dist/` is gitignored.

## API functions

These are in `functions/api/` and are served at `/api/*`.

| Endpoint | What it does | Secrets / vars |
| --- | --- | --- |
| `/api/weather` | Current conditions and a 5-day forecast for the park, from the Google Weather API | `GOOGLE_WEATHER_KEY` |
| `/api/reviews` | Google rating for the park, from the Places API (New) | `GOOGLE_WEATHER_KEY` (or `GOOGLE_MAPS_KEY`), optionally `GOOGLE_PLACE_ID` |
| `/api/contact` | Emails form enquiries through Resend | `RESEND_API_KEY`, optionally `CONTACT_TO` and `CONTACT_FROM` |

To set a secret:

```bash
npx wrangler pages secret put NAME --project-name mayfieldmanchester-co-uk
```

If a key is missing, each function falls back to a safe default instead of returning an error.

## Weather theming

The accent colour follows the live weather at the park. It's set by `data-weather` on `<html>`, and night mode is set by `data-mode="night"`.

| State | Token | Colour |
| --- | --- | --- |
| Overcast (default) | `--c-overcast` | `#a6ff27` |
| Sunny | `--c-sunny` | `#ffb700` |
| Rain | `--c-rain` | `#69e3ff` |
| Frost | `--c-frost` | `#69ffe1` |
| Night | `--c-night` | `#121e3e` |

To preview a state, add `?weather=sunny|rain|frost|overcast` or `?mode=night` to any URL. The Republic page ignores night mode.

## Assets

- **Header videos:** H.264 (High profile), 1280×720, 25fps, about 2 Mbps, faststart, no audio. Match this when a client sends new footage.
- **Client originals:** keep them in `originals/`, which is gitignored, so they're never deployed.
- **Fonts:** BDO Grotesk is self-hosted under the SIL Open Font License. The Republic page's serif comes from Adobe Fonts.
- **Favicon:** the Republic flag, animated by `motion.js`. The frames are in `assets/favicon/flag-sprite.png`.

## Deploying

1. Commit to a branch.
2. Open a merge request into `main` on GitLab.
3. Cloudflare Pages builds from git. Don't `wrangler pages deploy` straight to the project, because it serves the live domain.

## To do

- The Park page titles should be Stratos Bold. It isn't self-hosted yet, so they fall back to BDO Grotesk ExtraBold.
