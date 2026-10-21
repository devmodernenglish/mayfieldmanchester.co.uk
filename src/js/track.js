/* GA4 events for GTM (BlueTiger spec). Pushes queue in dataLayer; GTM only loads after cookie consent. */
(() => {
  window.dataLayer = window.dataLayer || [];
  const push = (event, params) => window.dataLayer.push({ event, ...params });
  const page = location.pathname.replace(/^\/|\.html$/g, "") || "index";
  const text = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();

  // Clicks: one delegated listener, most specific match first.
  document.addEventListener("click", (e) => {
    const t = e.target;
    const gal = t.closest("[data-gal], [data-lgal]");
    if (gal) {
      const box = gal.closest(".gallery, .lgallery");
      return push("gallery_interaction", {
        gallery: box.id || box.getAttribute("aria-label") || box.className.split(" ")[0],
        direction: gal.dataset.gal || gal.dataset.lgal,
      });
    }

    const a = t.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");

    if (href.startsWith("tel:")) return push("click_to_call", { phone: href.slice(4), page });
    if (href.startsWith("mailto:")) return push("click_to_email", { email: href.slice(7), page });
    if (a.closest(".mpanel")) return push("nav_click", { nav_item: text(a.querySelector(".mpanel__label") || a), page });
    if (a.closest(".rbenefit")) return push("tile_click", { tile: text(a.querySelector("h3") || a), link_url: a.href, page });

    if (a.host && a.host !== location.host && !/modernenglish\.co\.uk$/.test(a.hostname)) {
      push("outbound_click", { link_url: a.href, link_domain: a.hostname, page });
    }
  });

  // First interaction with each form.
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("focusin", () => push("form_start", { form_id: form.id, page }), { once: true });
  });

  // Section views, once each.
  if (!("IntersectionObserver" in window)) return;
  const seen = (sel, event, params) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      push(event, { page, ...params });
      io.disconnect();
    }, { threshold: 0.3 });
    io.observe(el);
  };
  seen(".contact-form", "view_contact_section");
  seen(".floors", "view_floor_specs", { block: "floors" });
  seen(".rspecs", "view_floor_specs", { block: "spec" });
})();
