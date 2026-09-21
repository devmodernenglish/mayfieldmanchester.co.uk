/* /api/contact: validates the contact form and emails it via Resend (JSON or HTML response).
   Needs secret RESEND_API_KEY; optional vars CONTACT_TO, CONTACT_FROM. */

const TO_DEFAULT   = "dev@modern-english.co.uk";   /* TODO: client inbox before launch */
const FROM_DEFAULT  = "Mayfield <noreply@web.republicofmayfield.com>";

/* Required fields and labels; message is optional. */
const REQUIRED = {
  name: "Contact name",
  email: "Email",
  company: "Company name",
  employees: "Number of employees",
};

/* Loose on purpose; Resend does the real check. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const wantsJSON = (request) =>
  (request.headers.get("accept") || "").includes("application/json");

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/* Branded response page for no-JS form posts. */
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
<a href="/contact">Back to contact</a></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* Accepts JSON, url-encoded or multipart bodies. */
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

  /* Honeypot: fake success, no send. */
  if ((f.website || "").trim()) {
    return json_ ? json({ ok: true }) : page("Thank you", "Your message has been sent.");
  }

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

  /* No key: fail with 503 and give the address to email instead. */
  if (!key) {
    const to = (env && env.CONTACT_TO) || TO_DEFAULT;
    return json_
      ? json({ ok: false, error: "email-unconfigured", to }, 503)
      : page("Email us directly", `Our form isn’t taking messages just now — please email ${to}.`, 503);
  }

  const to   = (env && env.CONTACT_TO)   || TO_DEFAULT;
  const from = (env && env.CONTACT_FROM) || FROM_DEFAULT;

  const subject = `Website enquiry — ${v.name}, ${v.company}`;
  /* Which form it came from (Contact or Republic). */
  const source = new URL(request.headers.get("referer") || "https://unknown/").pathname;
  const lines = [
    ["Name", v.name],
    ["Email", v.email],
    ["Company", v.company],
    ["Employees", v.employees],
    ["Message", message || "—"],
    ["Sent from", source],
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
        /* Replies go to the enquirer. */
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
    return json_
      ? json({ ok: false, error: "send-failed", reason: String(err.message || err), to }, 502)
      : page("Please try again", `We couldn’t send that just now — please email ${to} if it keeps happening.`, 502);
  }
}

export async function onRequest({ request }) {
  if (request.method === "POST") return; /* handled by onRequestPost */
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}
