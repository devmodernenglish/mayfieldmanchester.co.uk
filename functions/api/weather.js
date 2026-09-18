/* ==========================================================================
   /api/weather — Cloudflare Pages Function

   Proxies the Google Weather API and reduces its 39 condition types down to
   the five states the design system paints with.

   It exists as a Function rather than a fetch from the page because the
   Google key would otherwise be public in client JS. The key lives in the
   Pages project as an environment secret:

     npx wrangler pages secret put GOOGLE_WEATHER_KEY --project-name mayfieldmanchester-co-uk

   Without a key it returns the design's default rather than an error, so the
   page is never blocked on weather it cannot get.
   ========================================================================== */

/* Mayfield Park, Baring Street, Manchester M1 2PY. */
const LAT = 53.4769;
const LON = -2.2270;

/* Weather changes slowly and the quota does not. */
const TTL = 600; /* seconds */

/* ---- The mapping --------------------------------------------------------
   From the walkthrough (11:32): "if it's cloudy we go for green, so that's
   like an overcast colour, if it's sunny we'll go for an orange, if it's
   raining we'll go for a blue, if it's snowing or frosty then we can go for
   a sort of ice, teal colour".

   Anything unlisted falls through to `overcast`, which is the design's
   default — a new or unexpected condition type should look deliberate, not
   broken. Google documents 39 types; all of them are covered below, but the
   fallback means the list can drift without the site noticing.
   ---------------------------------------------------------------------- */
const SUNNY = ["CLEAR", "MOSTLY_CLEAR"];

const OVERCAST = ["PARTLY_CLOUDY", "MOSTLY_CLOUDY", "CLOUDY", "WINDY"];

const RAIN = [
  "WIND_AND_RAIN", "LIGHT_RAIN_SHOWERS", "CHANCE_OF_SHOWERS",
  "SCATTERED_SHOWERS", "RAIN_SHOWERS", "HEAVY_RAIN_SHOWERS",
  "LIGHT_TO_MODERATE_RAIN", "MODERATE_TO_HEAVY_RAIN", "RAIN", "LIGHT_RAIN",
  "HEAVY_RAIN", "RAIN_PERIODICALLY_HEAVY",
  /* Thunder and hail read as rain: the palette has no fifth colour for them,
     and blue is the honest reading of the sky. */
  "THUNDERSTORM", "THUNDERSHOWER", "LIGHT_THUNDERSTORM_RAIN",
  "SCATTERED_THUNDERSTORMS", "HEAVY_THUNDERSTORM", "HAIL", "HAIL_SHOWERS",
];

const FROST = [
  "LIGHT_SNOW_SHOWERS", "CHANCE_OF_SNOW_SHOWERS", "SCATTERED_SNOW_SHOWERS",
  "SNOW_SHOWERS", "HEAVY_SNOW_SHOWERS", "LIGHT_TO_MODERATE_SNOW",
  "MODERATE_TO_HEAVY_SNOW", "SNOW", "LIGHT_SNOW", "HEAVY_SNOW", "SNOWSTORM",
  "SNOW_PERIODICALLY_HEAVY", "HEAVY_SNOW_STORM", "BLOWING_SNOW",
  "RAIN_AND_SNOW",
];

const STATES = new Map();
for (const t of SUNNY)    STATES.set(t, "sunny");
for (const t of OVERCAST) STATES.set(t, "overcast");
for (const t of RAIN)     STATES.set(t, "rain");
for (const t of FROST)    STATES.set(t, "frost");

/* All five conditions are drawn (Components page, 214:2236). The WORD map is
   kept only as a safety net: if an unmapped state ever appears it says the
   condition rather than showing nothing. */
const GLYPH = { sunny: "clear", overcast: "cloudy", rain: "rain", frost: "frost" };
const WORD  = { sunny: "Clear", overcast: "Cloudy", rain: "Rain", frost: "Frost" };

/* Always hand back Celsius. Converted here rather than trusted, so the page
   renders the unit the design means no matter what the account's regional
   default does — the readout is a bare degree sign with nothing beside it. */
const celsius = (t) => {
  const d = t && t.degrees;
  if (typeof d !== "number") return null;
  return Math.round(t.unit === "FAHRENHEIT" ? ((d - 32) * 5) / 9 : d);
};

/* Night takes the moon whatever the sky is doing. In night mode the accent is
   the dark navy rather than a weather colour, so the condition is not being
   expressed by the palette either — the moon is what says "it is night in
   Manchester", and a sun after dark would simply be wrong. */
const badge = (state, night) => {
  const icon = night ? "night" : GLYPH[state] || null;
  return { icon, label: icon ? null : WORD[state] || null };
};

const json = (body, seconds) =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${seconds}`,
    },
  });

export async function onRequest({ env, request }) {
  const q = new URL(request.url).searchParams;

  /* Preview. The page forwards its own ?weather= / ?mode= through, so a state
     can be reviewed end to end — colour, icon and word — without waiting on
     the sky. It short-circuits before the upstream call, so reviewing states
     costs no quota. Keeping it here rather than in the page means the badge
     mapping stays in one place. */
  const preview = q.get("weather");
  if (["overcast", "sunny", "rain", "frost"].includes(preview)) {
    const night = q.get("mode") === "night";
    return json(
      {
        state: preview,
        mode: night ? "night" : "day",
        ...badge(preview, night),
        temperature: null,
        unit: "C",
        source: "preview",
      },
      0
    );
  }

  const key = env && env.GOOGLE_WEATHER_KEY;

  /* ---- 5-day forecast (the park page's weather strip) ------------------
     ?days=N returns an array of { day, icon, high, low } from the Weather API's
     forecast endpoint — same key and location as the current reading. The page
     leaves its placeholder markup in place if this is unavailable, so the strip
     never looks broken. */
  const daysParam = parseInt(q.get("days") || "0", 10);
  if (daysParam > 0) {
    if (!key) return json({ days: null, source: "default", reason: "no GOOGLE_WEATHER_KEY set" }, 60);
    const n = Math.min(Math.max(daysParam, 1), 10);
    const furl =
      "https://weather.googleapis.com/v1/forecast/days:lookup" +
      `?key=${encodeURIComponent(key)}&location.latitude=${LAT}&location.longitude=${LON}` +
      `&days=${n}&unitsSystem=METRIC`;
    const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    try {
      const res = await fetch(furl, { cf: { cacheTtl: TTL, cacheEverything: true } });
      if (!res.ok) throw new Error(`forecast api ${res.status}`);
      const data = await res.json();
      const out = ((data && data.forecastDays) || []).map((fd) => {
        const dd = fd.displayDate || {};
        const dow = typeof dd.year === "number"
          ? WD[new Date(Date.UTC(dd.year, dd.month - 1, dd.day)).getUTCDay()]
          : null;
        const type =
          fd?.daytimeForecast?.weatherCondition?.type ??
          fd?.nighttimeForecast?.weatherCondition?.type ?? null;
        const state = STATES.get(type) || "overcast";
        return { day: dow, state, icon: GLYPH[state] || "cloudy", high: celsius(fd.maxTemperature), low: celsius(fd.minTemperature) };
      });
      return json({ days: out, source: "google" }, TTL);
    } catch (err) {
      return json({ days: null, source: "fallback", reason: String(err.message || err) }, 60);
    }
  }

  /* No key configured: hand back the default so the page still renders in
     the brand's own colour rather than failing to a fallback it never chose. */
  if (!key) {
    return json(
      { state: "overcast", mode: "day", ...badge("overcast", false), source: "default", reason: "no GOOGLE_WEATHER_KEY set" },
      60
    );
  }

  const url =
    "https://weather.googleapis.com/v1/currentConditions:lookup" +
    `?key=${encodeURIComponent(key)}&location.latitude=${LAT}&location.longitude=${LON}` +
    /* Metric is the default, but ask for it: the readout is a bare "19°" with
       no unit beside it, so it had better be the one the design means. */
    "&unitsSystem=METRIC";

  try {
    const res = await fetch(url, { cf: { cacheTtl: TTL, cacheEverything: true } });
    if (!res.ok) throw new Error(`weather api ${res.status}`);

    const data = await res.json();
    const type = data?.weatherCondition?.type ?? null;
    const day  = data?.isDaytime !== false;
    const state = STATES.get(type) || "overcast";

    return json(
      {
        /* Night ignores the weather entirely — it is a separate axis, not a
           sixth condition — so both are returned and the page applies them
           independently. */
        state,
        mode: day ? "day" : "night",
        ...badge(state, !day),
        condition: type,
        description: data?.weatherCondition?.description?.text ?? null,
        /* Converted here rather than trusted, so the page only ever renders
           Celsius no matter what the account's regional default does. */
        temperature: celsius(data?.temperature),
        unit: "C",
        source: "google",
      },
      TTL
    );
  } catch (err) {
    /* Never let the weather break the page. */
    return json(
      { state: "overcast", mode: "day", ...badge("overcast", false), source: "fallback", reason: String(err.message || err) },
      60
    );
  }
}
