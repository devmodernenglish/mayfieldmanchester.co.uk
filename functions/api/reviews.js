/* ==========================================================================
   /api/reviews — Cloudflare Pages Function

   The star rating for Mayfield Park, from the Google Places API (New).

   Only the RATING comes from Google. The quotes in the panel are curated
   press, not Google review text — which is deliberate: displaying review text
   drags in per-review attribution obligations (reviewer avatar, name, profile
   link, publication time, an explanation of ordering, no reordering). An
   aggregate rating needs only that Google is credited, which the panel's logo
   does.

   Shares the key with the weather Function. Requires the Places API (New) to
   be enabled on the same Google Cloud project.
   ========================================================================== */

const PLACE_QUERY = "Mayfield Park, Baring Street, Manchester M1 2PY";

/* Resolved from PLACE_QUERY on 2026-09-08 and pinned here. Place IDs are the
   one field Google exempts from its caching restrictions, so this saves a
   billable Text Search call on every cache miss. Override with the
   GOOGLE_PLACE_ID binding if the listing is ever re-created. */
const PLACE_ID = "ChIJgYvh-9Oxe0gRqMwGbUU2AE4";

/* Ratings move slowly and the Enterprise SKU is not cheap, but Places terms
   are restrictive about caching anything except the place ID. Kept short. */
const TTL = 300;

const json = (body, seconds) =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${seconds}`,
    },
  });

/* Only reached if the pinned PLACE_ID above is cleared and no GOOGLE_PLACE_ID
   binding is set — i.e. when re-resolving a moved or re-created listing. */
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

  /* Preview, matching the weather Function: lets the panel be reviewed with a
     known rating, and short-circuits before any billable call. */
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

    /* The field mask is mandatory, and it decides the SKU — asking only for
       what is shown keeps this on the smallest bill it can be. */
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
        /* Returned so it can be pinned as GOOGLE_PLACE_ID and the search call
           dropped for good. */
        placeId,
        resolvedBySearch: !!resolved,
        source: "google",
      },
      TTL
    );
  } catch (err) {
    /* Never let a missing rating break the panel — the quotes still stand on
       their own, and the rating simply does not appear. */
    return json({ rating: null, source: "fallback", reason: String(err.message || err) }, 60);
  }
}
