/* ==========================================================================
   /api/contact — Cloudflare Pages Function

   Receives the contact form and emails it to the team via Resend. It exists as
   a Function, not a mailto, so the enquiry is validated, spam is dropped, and
   the sending credential never reaches the client. The key lives in the Pages
   project as an environment secret:

     npx wrangler pages secret put RESEND_API_KEY --project-name mayfieldmanchester-co-uk

   Two optional vars override the defaults without a code change:
     CONTACT_TO    where enquiries land   (default hello@mayfieldpark.com)
     CONTACT_FROM  the verified sender    (default Mayfield <noreply@mayfieldpark.com>)

   The form is progressively enhanced, so this answers two callers:
     - the JS path sends `Accept: application/json` and gets JSON back;
     - a no-JS native POST gets a small HTML page — a confirmation, or the
       error with a way back — so the form works with scripting off.
   ========================================================================== */

const TO_DEFAULT   = "hello@mayfieldpark.com";
const FROM_DEFAULT  = "Mayfield <noreply@mayfieldpark.com>";

/* Required fields and their human labels. Message is deliberately absent — the
   design marks it optional. */
const REQUIRED = {
  enquiry: "Enquiry type",
  name: "Contact name",
  email: "Email",
  company: "Company name",
  employees: "Number of employees",
};

/* Deliberately loose. A stricter pattern rejects valid addresses more often
   than it catches typos; the honest check is "one @ with something either
   side", and Resend does the real deliverability check. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const wantsJSON = (request) =>
  (request.headers.get("accept") || "").includes("application/json");

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/* A minimal branded page for the no-JS paths — same acid green, same type. */
const page = (title, body, status = 200) =>
  new Response(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Mayfield</title>
<style>
  body{margin:0;min-height:100svh;display:grid;place-items:center;
    background:#a6ff27;color:#000;text-align:center;padding:40px;
    font-family:"BDO Grotesk",Helvetica,Arial,sans-serif}
  h1{font-weight:800;font-size:clamp(40px,7vw,58px);letter-spacing:-.04em;
    text-transform:uppercase;line-height:1;margin:0 0 20px}
  p{font-size:22px;line-height:1.1;margin:0 0 30px;max-width:34ch}
  a{color:inherit;display:inline-flex;padding:12px 30px 13px;
    border:2px solid #000;border-radius:70px;font-size:15px;
    text-transform:uppercase;text-decoration:none}
</style></head><body><main><h1>${title}</h1><p>${body}</p>
<a href="/v2/contact.html">Back to contact</a></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* Read the body whichever way it arrived: a native form post is url-encoded or
   multipart, the JS enhancement may send either that or JSON. */
async function readFields(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const d = await request.json().catch(() => ({}));
    return d && typeof d === "object" ? d : {};
  }
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

export async function onRequestPost({ env, request }) {
  const json_ = wantsJSON(request);

  let f;
  try {
    f = await readFields(request);
  } catch {
    return json_
      ? json({ ok: false, error: "Could not read the form." }, 400)
      : page("Something went wrong", "We couldn’t read that submission. Please try again.", 400);
  }

  /* Honeypot. A person never sees this field, so anything in it is a bot —
     answered 200 with no send, so the bot cannot tell it was caught. */
  if ((f.website || "").trim()) {
    return json_ ? json({ ok: true }) : page("Thank you", "Your message has been sent.");
  }

  /* Validate. Trim first so a field of spaces is empty. */
  const v = {};
  for (const k of Object.keys(REQUIRED)) v[k] = (f[k] || "").trim();
  const message = (f.message || "").trim();

  const errors = {};
  for (const [k, label] of Object.entries(REQUIRED)) {
    if (!v[k]) errors[k] = `${label} is required.`;
  }
  if (v.email && !EMAIL_RE.test(v.email)) errors.email = "That email doesn’t look right.";

  if (Object.keys(errors).length) {
    return json_
      ? json({ ok: false, errors }, 400)
      : page("Check the form", Object.values(errors).join(" "), 400);
  }

  const key = env && env.RESEND_API_KEY;

  /* No key configured: do not tell anyone their message was sent when it was
     not. Hand back the addresses so the enquiry still has somewhere to go. */
  if (!key) {
    const to = (env && env.CONTACT_TO) || TO_DEFAULT;
    return json_
      ? json({ ok: false, error: "email-unconfigured", to }, 503)
      : page("Email us directly", `Our form isn’t taking messages just now — please email ${to}.`, 503);
  }

  const to   = (env && env.CONTACT_TO)   || TO_DEFAULT;
  const from = (env && env.CONTACT_FROM) || FROM_DEFAULT;

  const subject = `Website enquiry — ${v.enquiry} — ${v.name}`;
  const lines = [
    ["Enquiry type", v.enquiry],
    ["Name", v.name],
    ["Email", v.email],
    ["Company", v.company],
    ["Employees", v.employees],
    ["Message", message || "—"],
  ];
  const text = lines.map(([k, val]) => `${k}: ${val}`).join("\n");
  const html =
    `<table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">` +
    lines
      .map(
        ([k, val]) =>
          `<tr><td style="padding:4px 16px 4px 0;color:#666;vertical-align:top">${escape(k)}</td>` +
          `<td style="padding:4px 0;white-space:pre-wrap">${escape(val)}</td></tr>`
      )
      .join("") +
    `</table>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        /* So a reply in the inbox goes to the enquirer, not to noreply@. */
        reply_to: v.email,
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`resend ${res.status} ${detail}`.trim());
    }

    return json_
      ? json({ ok: true })
      : page("Thank you", "Your message has been sent — we’ll be in touch soon.");
  } catch (err) {
    /* The enquiry did not send. Say so honestly and give the address, rather
       than a cheerful confirmation for a mail that never left. */
    return json_
      ? json({ ok: false, error: "send-failed", reason: String(err.message || err), to }, 502)
      : page("Please try again", `We couldn’t send that just now — please email ${to} if it keeps happening.`, 502);
  }
}

/* Anything other than POST is not what this endpoint is for. */
export async function onRequest({ request }) {
  if (request.method === "POST") return; /* handled above */
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}
