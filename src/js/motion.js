/* Mayfield motion: hero-to-window scrub, window word/footage, menu, weather and page enhancements.
   No dependencies; without JS the page is a plain readable scroll. */
(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- 1. Hero -> window ---- */
  // Hero and fixed window are separate elements so nothing switches position:fixed mid-scroll.
  const hero   = document.getElementById("hero");
  const media  = document.getElementById("heroMedia");
  const mark   = document.getElementById("heroMark");
  const win    = document.getElementById("window");
  const nav    = document.getElementById("nav");

  /* ---- The window's footage ---- */
  // One <video> per section word; swaps crossfade between layers so nothing loads on the cut.
  const wmedia = document.getElementById("windowMedia");
  const layers = wmedia ? [...wmedia.querySelectorAll(".window__video")] : [];
  let   liveLayer = layers.find((v) => v.classList.contains("is-live")) || layers[0] || null;

  // Read from --win-fade so the duration lives only in CSS.
  const fadeMs = () => {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--win-fade").trim();
    return v.endsWith("ms") ? parseFloat(v) : (parseFloat(v) || 0.45) * 1000;
  };

  // Section cuts are ~1.2MB each, so defer loading until the window shows. Latched: called from both hero paths.
  let warmed = false;
  const warmWindow = () => {
    if (warmed) return;
    warmed = true;
    for (const v of layers) v.preload = "auto";
    if (liveLayer) liveLayer.play().catch(() => {});
  };

  const showCut = (word) => {
    const next = layers.find((v) => v.dataset.video === word);
    if (!next || next === liveLayer) return;
    const prev = liveLayer;
    liveLayer = next;

    // Play before it's visible so the fade doesn't open on a still frame.
    next.play().catch(() => {});
    next.classList.add("is-live");

    if (prev) {
      prev.classList.remove("is-live");
      // Pause after the fade (not mid-fade); recheck since a fast scroll back may have made it live again.
      setTimeout(() => {
        if (!prev.classList.contains("is-live")) prev.pause();
      }, fadeMs());
    }
  };

  // CSS scroll timeline drives the hero where supported; the JS path is the Firefox fallback.
  const cssDrivesHero = CSS.supports("animation-timeline", "scroll()");

  if (hero && media && win && !cssDrivesHero) {
    // Window size comes from CSS breakpoints, not hardcoded here.
    const target = () => {
      const r = win.getBoundingClientRect();
      return { w: r.width, h: r.height };
    };

    let handedOver = null;   /* null until the first frame */

    const frame = () => {
      const vh = window.innerHeight;
      const p  = Math.min(1, Math.max(0, window.scrollY / vh));
      const t  = target();

      // Video starts below the accent band (--nav-band), not at top 0.
      const band = parseFloat(getComputedStyle(document.documentElement)
                     .getPropertyValue("--nav-band")) || 12;
      const vw = window.innerWidth;

      const w = (1 - p) * vw + p * t.w;
      const h = (1 - p) * (vh - band) + p * t.h;

      media.style.width  = w + "px";
      media.style.height = h + "px";
      media.style.left   = ((vw - w) / 2) + "px";
      media.style.top    = ((1 - p) * band + p * ((vh - t.h) / 2)) + "px";

      // 0.26 = panel wordmark / hero wordmark, measured from Figma.
      if (mark) mark.style.scale = (1 - p * 0.74).toFixed(4);

      // Only touch the DOM when the handover state flips.
      const over = p >= 0.999;
      if (over !== handedOver) {
        handedOver = over;
        win.classList.toggle("is-live", over);
        hero.style.opacity = over ? "0" : "1";
        hero.style.pointerEvents = over ? "none" : "";
        if (nav) nav.classList.toggle("is-live", over);
        if (over) warmWindow();
      }
    };

    // rAF doesn't fire in hidden tabs, so run inline there or `ticking` stays latched.
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      const run = () => { frame(); ticking = false; };
      if (document.hidden) run();
      else requestAnimationFrame(run);
    };

    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    frame();
  }

  /* ---- 2. The window's word ---- */
  // On the CSS path the timeline reveals the window, but its video still needs starting.
  if (cssDrivesHero && win && layers.length) {
    const sentinel = document.querySelector(".runway");
    if (sentinel) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) return;
        warmWindow();
      }, { threshold: 0 }).observe(sentinel);
    }
  }

  const track = document.getElementById("windowTrack");
  const zones = [...document.querySelectorAll("[data-word]")];

  // Swap when the next section's top edge reaches the word's centre line; DIP shifts that line.
  const DIP = 0;

  const INTRO_WORD = "Mayfield";

  const wordBox = document.querySelector(".window__word");

  if (track && zones.length && wordBox) {
    let current = "";
    let remeasureTrack = () => {};   /* set by the scroll-jacked marquee below */

    const pick = () => {
      // Measured live so it holds across breakpoints.
      const wb = wordBox.getBoundingClientRect();
      const edge = wb.top + wb.height / 2 - DIP;

      // No default to zones[0]: the panel reads INTRO_WORD until the first section arrives.
      let best = null;
      for (const z of zones) {
        if (z.getBoundingClientRect().top <= edge) best = z;
      }

      const word = best ? best.dataset.word : INTRO_WORD;
      // Intro word sits still; section words marquee.
      wordBox.classList.toggle("is-intro", !best);
      if (word && word !== current) {
        current = word;
        // Six copies so the -50% keyframe loops without a visible reset.
        track.replaceChildren(...Array.from({ length: 6 }, () => {
          const s = document.createElement("span");
          s.textContent = word;
          return s;
        }));
        remeasureTrack();   /* the word changed, so the loop period changed */

        // Keyed on word so INTRO_WORD maps to the hero cut when scrolling back up.
        showCut(word);
      }
    };

    addEventListener("scroll", pick, { passive: true });
    addEventListener("resize", pick);
    pick();

    /* ---- Scroll-driven marquee ---- */
    // Word travel follows eased scroll velocity; CSS @keyframes remains the no-JS fallback.
    const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
    if (!reduceMQ.matches) {
      track.style.willChange = "transform";

      let rw = 0;                 /* width of one seamless repeat (px) */
      remeasureTrack = () => { rw = track.scrollWidth / 2; };

      let x = 0;                  /* current translateX, kept within (-rw, 0] */
      let v = 0;                  /* eased velocity actually applied (px/frame) */
      let want = 0;               /* velocity the gesture is asking for */
      let lastY = window.scrollY;

      const GAIN  = 0.11;         /* word travel per px scrolled */
      const VMAX  = 6;            /* cap so a hard flick stays gentle */
      const DECAY = 0.86;         /* the ask fades once scrolling stops */
      const EASE  = 0.08;         /* how softly v chases the ask (dir. easing) */

      addEventListener("scroll", () => {
        const y = window.scrollY;
        /* Reversed: scrolling down cycles the word right->left, up left->right. */
        want = Math.max(-VMAX, Math.min(VMAX, (lastY - y) * GAIN));
        lastY = y;
      }, { passive: true });

      const frame = () => {
        requestAnimationFrame(frame);
        if (wordBox.classList.contains("is-intro")) {   /* intro word: still, centred */
          if (x) { x = 0; track.style.transform = ""; }
          v = want = 0;
          return;
        }
        if (!rw) remeasureTrack();
        want *= DECAY;                       /* gesture fades when you stop */
        v += (want - v) * EASE;              /* ease into every direction change */
        x += v;
        if (rw) { x %= rw; if (x > 0) x -= rw; }   /* keep in (-rw, 0], seamless */
        track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      };
      remeasureTrack();
      addEventListener("resize", remeasureTrack);
      frame();
    }
  }

  /* ---- 2b. Parking the window ---- */
  // Offsets the still-fixed window via translate (no position switch, so no reflow jump) past the last .benefit.
  const lastBenefit = [...document.querySelectorAll(".benefit")].pop();

  if (win && lastBenefit) {
    // Scroll position where the last benefit's centre meets the viewport centre.
    const releaseY = () => {
      const r = lastBenefit.getBoundingClientRect();
      return r.top + window.scrollY + r.height / 2 - window.innerHeight / 2;
    };

    let parked = 0;   /* px, <= 0. Only written when it actually changes. */

    const park = () => {
      const past = window.scrollY - releaseY();
      const next = past > 0 ? -past : 0;
      if (next === parked) return;
      parked = next;
      win.style.setProperty("--win-park", next.toFixed(1) + "px");
    };

    let parkTick = false;
    const onParkScroll = () => {
      if (parkTick) return;
      parkTick = true;
      const run = () => { park(); parkTick = false; };
      if (document.hidden) run();
      else requestAnimationFrame(run);
    };

    addEventListener("scroll", onParkScroll, { passive: true });
    addEventListener("resize", onParkScroll);
    park();
  }

  /* ---- 3. Menu ---- */
  // All motion derives from --menu-p in CSS; JS only flips state and measures --seat-s.
  const navToggle = document.getElementById("navToggle");
  const navMark   = document.querySelector(".nav__mark");
  const SEAT_W    = 88;   /* [figma 190:11489] the wordmark in the 36px bar */

  const measureSeat = () => {
    if (!navMark) return;
    // offsetWidth, not getBoundingClientRect, which would include the current scale and compound.
    const full = navMark.offsetWidth;
    if (full) document.documentElement.style.setProperty("--seat-s", (SEAT_W / full).toFixed(5));
  };
  measureSeat();
  addEventListener("resize", measureSeat);

  if (navToggle && nav) {
    const root = document.documentElement;
    // Menu panel videos only load and play while the menu is open.
    const panelVideos = [...nav.querySelectorAll(".mpanel__media")];
    const setOpen = (open) => {
      root.classList.toggle("menu-open", open);
      navToggle.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
      panelVideos.forEach((v) => {
        if (open) { v.preload = "auto"; v.play().catch(() => {}); }
        else v.pause();
      });
    };
    const toggle = () => setOpen(!root.classList.contains("menu-open"));
    navToggle.addEventListener("click", toggle);
    // The hero's own MENU button opens it too.
    document.querySelectorAll("[data-menu-open]").forEach(b => b.addEventListener("click", toggle));
    nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setOpen(false)));
    addEventListener("keydown", e => {
      if (e.key === "Escape" && root.classList.contains("menu-open")) setOpen(false);
    });
  }

  /* ---- 3b. Interior-page bar reveal ---- */
  // .phero pages have no hero handover, so show the bar once the header scrolls past.
  const phero = document.querySelector(".phero");
  if (phero && nav && !nav.classList.contains("nav--static")) {
    new IntersectionObserver(([e]) => {
      nav.classList.toggle("is-live", !e.isIntersecting);
    }, { threshold: 0 }).observe(phero);
  }

  /* ---- 4b. The power of Mayfield ---- */
  // Quotes are curated; only the aggregate rating comes from Google (avoids per-review attribution rules).
  const power = document.getElementById("power");
  if (power) {
    const quotes = [...power.querySelectorAll(".power__quote")];
    const count = document.getElementById("powerCount");
    let at = 0;

    const show = (i) => {
      at = (i + quotes.length) % quotes.length;
      quotes.forEach((q, n) => q.classList.toggle("is-on", n === at));
      if (count) count.textContent = `${at + 1}/${quotes.length}`;
    };
    power.querySelectorAll("[data-power]").forEach((b) =>
      b.addEventListener("click", () => show(at + (b.dataset.power === "next" ? 1 : -1)))
    );
    show(0);

    // Solid stars are clipped by rect width so any fractional score renders exactly.
    const STAR_PITCH = 22;   /* matches the <use x=""> spacing in the markup */
    const STAR_W = 20;

    fetch("api/reviews" + location.search, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || typeof d.rating !== "number") return;   /* no score, no claim */
        const score = document.getElementById("powerScore");
        const stars = document.getElementById("powerStars");
        const rect = document.getElementById("pmFillRect");
        if (score) score.textContent = d.rating.toFixed(1);
        if (rect) {
          const full = Math.floor(d.rating);
          const part = d.rating - full;
          rect.setAttribute("width", String(full * STAR_PITCH + part * STAR_W));
        }
        if (stars) {
          stars.setAttribute("aria-label",
            `${d.rating.toFixed(1)} out of 5` + (d.count ? ` from ${d.count} Google reviews` : " on Google"));
        }
        power.classList.add("is-rated");
      })
      .catch(() => {});
  }

  /* ---- 5. Link hover ---- */
  // Delegated pointerover (bubbles) instead of per-link pointerenter/leave, which can strand a drawn rule.
  const LINKS = ".nav__links a, .foot__links a, .foot__legal a, .insta__text a";
  const links = document.querySelectorAll(LINKS);

  if (links.length) {
    document.documentElement.classList.add("js-underline");

    links.forEach((link) => {
      link.classList.add("u-link");

      const lbl = document.createElement("span");
      lbl.className = "lbl";
      while (link.firstChild) lbl.appendChild(link.firstChild);
      link.appendChild(lbl);

      const bar = document.createElement("span");
      bar.className = "u";
      link.appendChild(bar);
    });

    let active = null;

    const leave = (link, x) => {
      if (!link) return;
      /* Origin flips so the rule exits the way it was travelling. */
      const r = link.getBoundingClientRect();
      const fromRight = typeof x === "number" ? (x - r.left) > r.width / 2 : true;
      link.style.setProperty("--u-from", fromRight ? "right" : "left");
      link.classList.remove("is-on");
    };

    const enter = (link, x) => {
      const r = link.getBoundingClientRect();
      link.style.setProperty("--u-from", (x - r.left) < r.width / 2 ? "left" : "right");
      link.classList.add("is-on");
    };

    document.addEventListener("pointerover", (e) => {
      const link = e.target.closest ? e.target.closest(".u-link") : null;
      if (link === active) return;
      leave(active, e.clientX);
      active = link;
      if (link) enter(link, e.clientX);
    });

    // Cases where no pointerover follows: leaving the window, blur, cancelled touch.
    const clear = () => { leave(active); active = null; };
    document.addEventListener("pointerleave", clear);
    document.addEventListener("pointercancel", clear);
    addEventListener("blur", clear);

    /* Keyboard parity — focus draws the same rule. */
    links.forEach((link) => {
      link.addEventListener("focus", () => {
        link.style.setProperty("--u-from", "left");
        link.classList.add("is-on");
      });
      link.addEventListener("blur", () => link.classList.remove("is-on"));
    });
  }

  /* ---- 4. Weather ---- */
  // api/weather proxies Google so the key stays server-side; ?weather= and ?mode= override and are forwarded.
  const STATES = ["overcast", "sunny", "rain", "frost"];
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);

  const forcedWeather = params.get("weather");
  const forcedMode = params.get("mode");
  if (STATES.includes(forcedWeather)) root.dataset.weather = forcedWeather;
  if (forcedMode === "night") root.dataset.mode = "night";

  const paint = ({ state, mode, icon, label, temperature }) => {
    if (STATES.includes(state) && !STATES.includes(forcedWeather)) {
      root.dataset.weather = state;
    }
    if (!forcedMode) {
      if (mode === "night") root.dataset.mode = "night";
      else root.removeAttribute("data-mode");
    }
    // Function sends Celsius; leave empty rather than show an invented reading.
    const reading = typeof temperature === "number" ? `${temperature}\u00b0` : "";
    document.querySelectorAll("#navTemp, #heroTemp").forEach((el) => {
      el.textContent = reading;
    });

    // Icon where one exists, otherwise the condition's name.
    document.querySelectorAll(".nav__temp, .hero__meta .temp").forEach((box) => {
      const glyph = box.querySelector(".wx-icon");
      const word = box.querySelector(".wx-word");
      if (!glyph || !word) return;
      if (icon) {
        // Mask (--wx) takes the text colour; URL is absolute since url() in a custom prop resolves against the CSS file.
        const href = new URL(`assets/icons/weather-${icon}.svg`, document.baseURI).href;
        glyph.style.setProperty("--wx", `url("${href}")`);
        glyph.hidden = false;
        word.hidden = true;
      } else if (label) {
        glyph.hidden = true;
        word.textContent = label;
        word.hidden = false;
      }
    });
  };

  // Reveal on every path: success, bad response or network failure.
  const reveal = () => root.classList.add("wx-ready");

  fetch("api/weather" + location.search, { headers: { accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d) paint(d); })
    .catch(() => {})
    .finally(reveal);

  // Backstop in case the request hangs.
  setTimeout(reveal, 3000);

  const clock = document.getElementById("heroTime");
  if (clock) {
    const tick = () => {
      const d = new Date();
      const t = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      clock.textContent = t;
      clock.setAttribute("datetime", t);
    };
    tick();
    setInterval(tick, 30000);
  }

  /* ---- 5b. Five-day forecast strip (park page) ---- */
  // Overwrites the static placeholder only if live data arrives.
  (() => {
    const strip = document.querySelector(".wxstrip");
    if (!strip) return;
    const rows = [...strip.querySelectorAll(".wxday")];
    if (!rows.length) return;
    fetch(`api/weather?days=${rows.length}`, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !Array.isArray(d.days) || !d.days.length) return;
        rows.forEach((row, i) => {
          const f = d.days[i];
          if (!f) return;
          const spans = row.querySelectorAll("span");
          if (spans[0] && f.day) spans[0].textContent = f.day;
          const icon = row.querySelector(".wxday__icon");
          if (icon && f.icon) {
            const href = new URL(`assets/icons/weather-${f.icon}.svg`, document.baseURI).href;
            icon.style.setProperty("--wx", `url("${href}")`);
          }
          const temp = spans[spans.length - 1];
          if (temp && typeof f.high === "number") temp.textContent = `${f.high}°`;
        });
      })
      .catch(() => {});
  })();

  /* ---- 6. Contact form ---- */
  // Progressive enhancement: same FormData as the native post, but asks for JSON to stay on the page.
  const form = document.getElementById("contactForm");
  if (form) {
    const submit = document.getElementById("contactSubmit");
    const status = document.getElementById("contactStatus");

    const say = (msg, isError) => {
      if (!status) return;
      status.textContent = msg;
      status.hidden = false;
      status.classList.toggle("form__status--err", !!isError);
    };

    form.addEventListener("submit", (e) => {
      if (!form.checkValidity()) return;   /* native validation + native post */
      e.preventDefault();

      if (submit) { submit.disabled = true; rollLabel(submit, "Sending…"); }
      say("", false);
      status && (status.hidden = true);

      fetch(form.action, {
        method: "POST",
        headers: { accept: "application/json" },
        body: new FormData(form),
      })
        .then((r) => r.json().catch(() => ({ ok: r.ok })))
        .then((d) => {
          if (d && d.ok) {
            form.reset();
            [...form.elements].forEach((el) => { if (el.type !== "hidden") el.disabled = true; });
            if (submit) submit.hidden = true;
            say("Thank you — your message has been sent. We’ll be in touch soon.", false);
          } else {
            const first = d && d.errors ? Object.values(d.errors)[0] : null;
            say(first || "Sorry — that didn’t send. Please try again, or email hello@mayfieldpark.com.", true);
            if (submit) { submit.disabled = false; rollLabel(submit, "Submit"); }
          }
        })
        .catch(() => {
          say("Sorry — that didn’t send. Please email hello@mayfieldpark.com.", true);
          if (submit) { submit.disabled = false; rollLabel(submit, "Submit"); }
        });
    });
  }

  /* ---- 7. Gallery: 3D dropping stack ---- */
  // Cards deeper than VISIBLE are hidden so long sets don't read as a slab.
  const VISIBLE = 4;
  document.querySelectorAll(".gallery").forEach((gallery) => {
    const slides = [...gallery.querySelectorAll(".gallery__slide")];
    const count = gallery.querySelector(".gallery__count");
    const n = slides.length;
    if (!n) return;

    gallery.classList.add("is-live");
    let active = 0;
    let busy = false;

    const depthOf = (s) => (slides.indexOf(s) - active + n) % n;

    /* Place one slide at a given stack depth (0 = front). */
    const place = (s, d) => {
      const shown = d < VISIBLE;
      s.style.setProperty("--d", d);
      s.style.zIndex = String(999 - d);
      s.style.setProperty("--dim", shown ? Math.min(d * 0.16, 0.6).toFixed(2) : "0");
      s.style.opacity = shown ? "1" : "0";
      s.classList.toggle("is-shown", shown);
      s.classList.toggle("is-front", d === 0);
      s.style.pointerEvents = d === 0 ? "auto" : "none";
      s.setAttribute("aria-hidden", d === 0 ? "false" : "true");
    };

    const layout = (except) => {
      slides.forEach((s) => { if (s !== except) place(s, depthOf(s)); });
      if (count) count.textContent = `${active + 1}/${n}`;
    };

    // Apply styles with transitions off so resets never animate on screen.
    const snap = (s, fn) => {
      const prev = s.style.transition;
      s.style.transition = "none";
      fn();
      void s.offsetWidth;
      s.style.transition = prev;
    };

    // Runs after the transform transition, with a timeout backstop so the gallery can't lock.
    const afterMove = (s, cb) => {
      let done = false;
      const fin = () => { if (done) return; done = true; s.removeEventListener("transitionend", te); cb(); };
      const te = (e) => { if (e.propertyName === "transform") fin(); };
      s.addEventListener("transitionend", te);
      setTimeout(fin, 900);
    };

    // Next: front card drops out, then snaps invisibly to the back.
    const next = () => {
      if (busy) return; busy = true;
      const out = slides[active];
      out.style.zIndex = "2000";
      out.classList.add("is-dropping");
      active = (active + 1) % n;
      layout(out);
      afterMove(out, () => {
        out.classList.remove("is-dropping");
        out.style.zIndex = "";
        out.style.transform = "";
        snap(out, () => place(out, depthOf(out)));   /* back of the stack, hidden */
        busy = false;
      });
    };

    // Prev: the new front card drops in from above.
    const prev = () => {
      if (busy) return; busy = true;
      active = (active - 1 + n) % n;
      const inc = slides[active];
      snap(inc, () => {
        place(inc, 0);
        inc.style.zIndex = "2000";
        inc.style.opacity = "0";
        inc.style.transform = "translate(-50%, -50%) translateY(-230%)";
      });
      inc.style.transform = "";        /* -> CSS front position, animated */
      inc.style.opacity = "1";
      layout(inc);
      afterMove(inc, () => { inc.style.zIndex = ""; place(inc, 0); busy = false; });
    };

    const go = (dir) => (dir > 0 ? next() : prev());

    gallery.querySelectorAll("[data-gal]").forEach((b) =>
      b.addEventListener("click", () => go(b.dataset.gal === "next" ? 1 : -1))
    );

    // Short travel is a click (advance); a real drag pages by direction (up/left = next).
    const DRAG_MIN = 40;
    let dragging = false, sx = 0, sy = 0, moved = 0;
    const stage = gallery.querySelector(".gallery__stage");
    if (stage) {
      stage.addEventListener("pointerdown", (e) => {
        if (busy) return;
        dragging = true; moved = 0; sx = e.clientX; sy = e.clientY;
        gallery.classList.add("is-dragging");
        stage.setPointerCapture?.(e.pointerId);
      });
      stage.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        moved = Math.max(moved, Math.hypot(e.clientX - sx, e.clientY - sy));
      });
      const end = (e) => {
        if (!dragging) return;
        dragging = false;
        gallery.classList.remove("is-dragging");
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (moved < 8) { next(); return; }                 /* a click = advance */
        if (moved < DRAG_MIN) return;                       /* too small to count */
        const primary = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        go(primary < 0 ? 1 : -1);                           /* up/left = next */
      };
      stage.addEventListener("pointerup", end);
      stage.addEventListener("pointercancel", () => { dragging = false; gallery.classList.remove("is-dragging"); });
    }

    layout();
  });

  /* ---- 8. Republic floors: hover swaps the building render ---- */
  const floorsBox = document.querySelector(".floors__img");
  if (floorsBox && floorsBox.querySelector("img")) {
    const rows = [...document.querySelectorAll(".floor[data-render]")];
    /* Preload the distinct renders so a swap never waits on the network. */
    [...new Set(rows.map((r) => r.dataset.render))].forEach((s) => { const i = new Image(); i.src = s; });
    // Two stacked layers so the render crossfades.
    const a = floorsBox.querySelector("img");
    const b = a.cloneNode(false);
    b.removeAttribute("alt");
    b.style.opacity = "0";
    floorsBox.appendChild(b);
    let front = a, cur = a.getAttribute("src");
    const swap = (src) => {
      if (!src || src === cur) return;
      cur = src;
      const back = front === a ? b : a;
      const leaving = front;                 /* captured — reveal must NOT read the live `front` */
      back.src = src;
      const reveal = () => {
        if (cur !== src) return;             /* a newer hover superseded this swap */
        back.style.opacity = "1";
        leaving.style.opacity = "0";
        front = back;
      };
      // decode() resolves exactly once, even when cached.
      if (back.decode) back.decode().then(reveal, reveal);
      else back.onload = reveal;
    };
    rows.forEach((row) => {
      row.addEventListener("pointerenter", () => swap(row.dataset.render));
      row.addEventListener("focusin", () => swap(row.dataset.render));
    });
  }

  /* ---- 10. Location list: map follows the cursor ---- */
  // Map trails the pointer (lerp) and swings with horizontal velocity; desktop fine-pointer only.
  const finePointer = matchMedia("(min-width: 1024px) and (hover: hover)");
  if (finePointer.matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll(".rlocations").forEach((list) => {
      const rows = [...list.querySelectorAll(".rloc")];
      if (!rows.length) return;
      let active = null, tx = 0, ty = 0, x = 0, y = 0, px = 0, rot = 0, running = false;

      const aim = (e) => { const r = list.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top; };
      list.addEventListener("pointermove", aim);

      rows.forEach((row) => {
        const map = row.querySelector(".rloc__map");
        if (!map) return;
        row.addEventListener("pointerenter", (e) => {
          aim(e);
          if (!active) { x = tx; y = ty; px = x; rot = 0; }   /* snap on first entry, no fly-in */
          if (active && active !== map) active.classList.remove("is-on");
          active = map; map.classList.add("is-on");
          if (!running) { running = true; requestAnimationFrame(frame); }
        });
      });
      list.addEventListener("pointerleave", () => {
        if (active) active.classList.remove("is-on");
        active = null;
      });

      function frame() {
        if (!active) { running = false; return; }   /* idle out when nothing is hovered */
        requestAnimationFrame(frame);
        px = x;
        x += (tx - x) * 0.16;                         /* trailing follow */
        y += (ty - y) * 0.16;
        const target = Math.max(-22, Math.min(22, (x - px) * 1.4));   /* swing from h-velocity */
        rot += (target - rot) * 0.12;
        active.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${rot.toFixed(2)}deg)`;
      }
    });
  }

  /* ---- 9. FAQ accordion ---- */
  // Not <details>: it can't animate height or put the control under the answer.
  document.querySelectorAll(".faq").forEach((faq, fi) => {
    faq.querySelectorAll(".faq__item").forEach((item, i) => {
      const btn = item.querySelector(".faq__toggle");
      const panel = item.querySelector(".faq__panel");
      if (!btn || !panel) return;
      panel.id = panel.id || `faqp-${fi}-${i}`;
      btn.setAttribute("aria-controls", panel.id);
      btn.addEventListener("click", () => {
        const open = item.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  });

  /* ---- 11. Benefit panels: pinned stacking deck ---- */
  // Sticky pin over a tall runway; each card slides up and earlier ones scale back.
  (() => {
    const section = document.querySelector(".bpanels");
    const pin = section && section.querySelector(".bpanels__pin");
    const cards = pin ? Array.from(pin.querySelectorAll(".bpanel")) : [];
    if (reduced || !section || cards.length < 2) return;
    const N = cards.length;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const STEP = 0.05;                                 // scale lost per card in front
    cards.forEach((c, i) => { c.style.zIndex = String(i); c.style.willChange = "transform"; });
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const total = section.offsetHeight - vh;         // scrollable runway
      const P = total > 0 ? clamp(-section.getBoundingClientRect().top / total, 0, 1) : 0;
      const TOP = vh < 800 ? 48 : 60;                  // first card's offset from section top [figma]
      const PEEK = vh < 800 ? 34 : 44;                 // offset per stacked card
      const ENTER = vh;                                // how far below a card starts
      // F runs 1 -> N so the first card is already in place when the section pins.
      const F = P * (N - 1) + 1;
      for (let i = 0; i < N; i++) {
        const enter  = clamp(F - i, 0, 1);                 // 0→1 as card i arrives
        const recede = clamp(F - (i + 1), 0, N - 1 - i);   // later cards now on top of i
        const restTop = TOP + i * PEEK;                    // back card highest, front lowest
        const ty = (1 - enter) * ENTER + enter * restTop;
        const scale = 1 - recede * STEP;
        cards[i].style.transform = `translateY(${ty.toFixed(1)}px) scale(${scale.toFixed(4)})`;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    update();
  })();

  /* ---- 12. Character reveal on scroll ---- */
  // Splits text nodes only, so nested markup survives.
  (() => {
    if (reduced) return;
    // Excluded areas have their own motion.
    const EXCLUDE = "footer, .nav, .initial-nav, .window, .bpanel, .flag, .dest, .wxstrip, .hero, .rhero";
    const SEL = "h1, h2, h3, h4, p, .rtitle, .rloc__name, .rloc__time";
    const targets = [...document.querySelectorAll(SEL)].filter(
      (el) => el.textContent.trim() && !el.dataset.reveal && !el.closest(EXCLUDE)
    );
    if (!targets.length) return;

    const split = (el) => {
      el.dataset.reveal = "1";
      const original = el.textContent;
      const count = original.replace(/\s/g, "").length || 1;
      const per = Math.min(0.012, 0.6 / count);   /* cap total stagger ~0.6s */
      let i = 0;
      const walk = (node) => {
        [...node.childNodes].forEach((child) => {
          if (child.nodeType === 3) {
            const frag = document.createDocumentFragment();
            // Words are nowrap spans; spaces stay as text so lines break only between words.
            child.textContent.split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
              const word = document.createElement("span");
              word.className = "reveal-word";
              for (const ch of part) {
                const s = document.createElement("span");
                s.className = "reveal-char";
                s.textContent = ch;
                s.style.setProperty("--d", (i++ * per).toFixed(3) + "s");
                word.appendChild(s);
              }
              frag.appendChild(word);
            });
            child.replaceWith(frag);
          } else if (child.nodeType === 1) {
            const tag = child.tagName;
            if (tag === "IMG" || tag === "BR" || tag === "SVG") return;
            walk(child);
          }
        });
      };
      walk(el);
      // Plain text as aria-label so screen readers don't read it char by char.
      el.setAttribute("aria-label", original);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add("is-revealed"); io.unobserve(e.target); }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0 }
    );
    targets.forEach((el) => { split(el); io.observe(el); });
  })();

  /* ---- 13. The button roll ---- */
  // Builds the duplicate label the CSS roll needs. Hoisted for §6; all label changes must go through here.
  function rollLabel(btn, text) {
    const label = text !== undefined ? text : btn.textContent.trim();
    if (!label) return;

    const roll  = document.createElement("span");
    const track = document.createElement("span");
    roll.className  = "btn__roll";
    track.className = "btn__roll-track";

    // Hide the twin from the accessible name.
    const original = document.createElement("span");
    original.textContent = label;
    const twin = document.createElement("span");
    twin.textContent = label;
    twin.setAttribute("aria-hidden", "true");

    track.append(original, twin);
    roll.append(track);
    btn.replaceChildren(roll);
  }

  for (const btn of document.querySelectorAll(".btn")) {
    if (btn.firstElementChild) continue;          /* composed by hand */
    rollLabel(btn);
  }

  /* ---- 14. Animated favicon ---- */
  // Only Firefox animates GIF favicons, so step sprite frames manually. Safari ignores changes after load.
  const iconLink = document.querySelector('link[rel="icon"][data-anim]');
  if (iconLink && !reduced) {
    const SIZE = 64, FRAMES = 20, STEP_MS = 80;
    const sprite = new Image();
    sprite.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      const urls = [];
      for (let i = 0; i < FRAMES; i++) {
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(sprite, i * SIZE, 0, SIZE, SIZE, 0, 0, SIZE, SIZE);
        urls.push(canvas.toDataURL("image/png"));
      }
      let f = 0;
      setInterval(() => {
        f = (f + 1) % FRAMES;
        iconLink.href = urls[f];
      }, STEP_MS);
    };
    sprite.src = iconLink.dataset.anim;
  }

})();
