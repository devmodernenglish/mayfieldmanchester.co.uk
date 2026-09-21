/* /api/reviews: Mayfield Park's Google rating (no review text, which carries attribution rules).
   Needs GOOGLE_MAPS_KEY or GOOGLE_WEATHER_KEY with Places API (New) enabled; optional GOOGLE_PLACE_ID. */

const PLACE_QUERY = "Mayfield Park, Baring Street, Manchester M1 2PY";

/* Pinned to skip a billable Text Search; Place IDs are exempt from Google's caching limits. */
const PLACE_ID = "ChIJgYvh-9Oxe0gRqMwGbUU2AE4";

/* Short: Places terms restrict caching anything but the place ID. */
const TTL = 300;

const json = (body, seconds) =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${seconds}`,
    },
  });

/* Only used if PLACE_ID and GOOGLE_PLACE_ID are both empty. */
async function findPlaceId(key) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName",
    },
    body: JSON.stringify({ textQuery: PLACE_QUERY, maxResultCount: 1 }),
  });
  if (!res.ok) throw new Error(`places search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const place = data?.places?.[0];
  if (!place?.id) throw new Error("no place found");
  return { id: place.id, name: place.displayName?.text ?? null };
}

export async function onRequest({ env, request }) {
  const q = new URL(request.url).searchParams;

  /* Preview: ?rating=4.5&count=N returns a fake rating, no API call. */
  const previewRating = parseFloat(q.get("rating"));
  if (!Number.isNaN(previewRating)) {
    return json(
      { rating: previewRating, count: Number(q.get("count")) || 1200, source: "preview" },
      0
    );
  }

  const key = env && (env.GOOGLE_MAPS_KEY || env.GOOGLE_WEATHER_KEY);
  if (!key) return json({ rating: null, source: "default", reason: "no API key set" }, 60);

  try {
    let placeId = env.GOOGLE_PLACE_ID || PLACE_ID;
    let resolved = null;
    if (!placeId) {
      resolved = await findPlaceId(key);
      placeId = resolved.id;
    }

    /* Field mask is required and sets the billing SKU; keep it minimal. */
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,displayName",
        },
      }
    );
    if (!res.ok) throw new Error(`place details ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const d = await res.json();
    return json(
      {
        rating: typeof d.rating === "number" ? d.rating : null,
        count: typeof d.userRatingCount === "number" ? d.userRatingCount : null,
        url: d.googleMapsUri ?? null,
        name: d.displayName?.text ?? null,
        /* So a searched ID can be pinned as GOOGLE_PLACE_ID. */
        placeId,
        resolvedBySearch: !!resolved,
        source: "google",
      },
      TTL
    );
  } catch (err) {
    return json({ rating: null, source: "fallback", reason: String(err.message || err) }, 60);
  }
}
