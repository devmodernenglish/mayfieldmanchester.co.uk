/* /api/weather: proxies Google Weather API, maps conditions to the design's weather states.
   Needs secret GOOGLE_WEATHER_KEY; without it returns the default (overcast). */

/* Mayfield Park, Baring Street, Manchester M1 2PY. */
const LAT = 53.4769;
const LON = -2.2270;

/* 10 min cache to save API quota. */
const TTL = 600;

/* Google condition types -> state. Unlisted types fall back to overcast. */
const SUNNY = ["CLEAR", "MOSTLY_CLEAR"];

const OVERCAST = ["PARTLY_CLOUDY", "MOSTLY_CLOUDY", "CLOUDY", "WINDY"];

const RAIN = [
  "WIND_AND_RAIN", "LIGHT_RAIN_SHOWERS", "CHANCE_OF_SHOWERS",
  "SCATTERED_SHOWERS", "RAIN_SHOWERS", "HEAVY_RAIN_SHOWERS",
  "LIGHT_TO_MODERATE_RAIN", "MODERATE_TO_HEAVY_RAIN", "RAIN", "LIGHT_RAIN",
  "HEAVY_RAIN", "RAIN_PERIODICALLY_HEAVY",
  /* Thunder and hail map to rain. */
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

/* WORD is a text fallback if a state has no icon. */
const GLYPH = { sunny: "clear", overcast: "cloudy", rain: "rain", frost: "frost" };
const WORD  = { sunny: "Clear", overcast: "Cloudy", rain: "Rain", frost: "Frost" };

/* Always return Celsius, whatever unit the API sends. */
const celsius = (t) => {
  const d = t && t.degrees;
  if (typeof d !== "number") return null;
  return Math.round(t.unit === "FAHRENHEIT" ? ((d - 32) * 5) / 9 : d);
};

/* At night the icon is always the moon. */
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

  /* Preview: ?weather=<state>&mode=night returns a fake reading, no API call. */
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

  /* ?days=N: daily forecast (max 10) for the park page's weather strip. */
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

  if (!key) {
    return json(
      { state: "overcast", mode: "day", ...badge("overcast", false), source: "default", reason: "no GOOGLE_WEATHER_KEY set" },
      60
    );
  }

  const url =
    "https://weather.googleapis.com/v1/currentConditions:lookup" +
    `?key=${encodeURIComponent(key)}&location.latitude=${LAT}&location.longitude=${LON}` +
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
        /* state and mode are independent; the page applies both. */
        state,
        mode: day ? "day" : "night",
        ...badge(state, !day),
        condition: type,
        description: data?.weatherCondition?.description?.text ?? null,
        temperature: celsius(data?.temperature),
        unit: "C",
        source: "google",
      },
      TTL
    );
  } catch (err) {
    return json(
      { state: "overcast", mode: "day", ...badge("overcast", false), source: "fallback", reason: String(err.message || err) },
      60
    );
  }
}
