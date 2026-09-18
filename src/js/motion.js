/* ==========================================================================
   MAYFIELD V2 — MOTION
   No dependencies. Three jobs:
     1. Drive the hero down into the fixed window as the user scrolls.
     2. Swap the window's word AND its footage (WORK / EXPLORE / PLAY) per
        section — one decision, so the two always turn together.
     3. Menu open/close, and the weather state that colours the whole site.

   Rule carried over from V1: nothing is hidden in CSS that JS is responsible
   for showing. Without JS the page is a plain, readable scroll.
   ========================================================================== */
(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- 1. Hero -> window ------------------------------------------------
     The runway is 200vh with a sticky 100svh stage inside it. Progress across
     the first viewport of scroll drives the hero video from full-bleed down
     to the window's footprint, and the wordmark down with it — "we scale this
     down as the user scrolls, so the user will be in control of this track".

     The hero and the window are separate elements: the hero is animated, and
     at p=1 it hands over to the fixed window, which then never moves again.
     Trying to make one element do both would mean switching position:fixed
     mid-scroll, which reflows and jumps. */
  const hero   = document.getElementById("hero");
  const media  = document.getElementById("heroMedia");
  const mark   = document.getElementById("heroMark");
  const win    = document.getElementById("window");
  const nav    = document.getElementById("nav");

  /* ---- The window's footage ---------------------------------------------
     One <video> per section, stacked in .window__media and keyed by the same
     word the panel shows. Swapping is a crossfade between layers, so the cut
     changes on the same frame as the word with nothing to load first.

     Declared here rather than beside the word logic because the hero handover
     below is what first brings the window on, and that is the moment the
     footage is allowed to start costing bandwidth. */
  const wmedia = document.getElementById("windowMedia");
  const layers = wmedia ? [...wmedia.querySelectorAll(".window__video")] : [];
  let   liveLayer = layers.find((v) => v.classList.contains("is-live")) || layers[0] || null;

  /* How long the outgoing layer takes to clear, straight from --win-fade so
     the number lives in the stylesheet and not in two places. */
  const fadeMs = () => {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--win-fade").trim();
    return v.endsWith("ms") ? parseFloat(v) : (parseFloat(v) || 0.45) * 1000;
  };

  /* Nothing downloads until the window is actually on screen — the section
     cuts are ~1.2MB each and are useless above the fold. Called from both
     hero paths (JS scrub and CSS timeline), hence the latch. */
  let warmed = false;
  const warmWindow = () => {
    if (warmed) return;
    warmed = true;
    for (const v of layers) v.preload = "auto";
    if (liveLayer) liveLayer.play().catch(() => {});
  };

  /* Show the cut belonging to `word`. A no-op when that layer is already
     live, or when no layer declares the word. */
  const showCut = (word) => {
    const next = layers.find((v) => v.dataset.video === word);
    if (!next || next === liveLayer) return;
    const prev = liveLayer;
    liveLayer = next;

    /* Start the incoming clip before it is visible, so the fade opens on
       moving footage rather than on a still first frame. */
    next.play().catch(() => {});
    next.classList.add("is-live");

    if (prev) {
      prev.classList.remove("is-live");
      /* Pause once it has faded out, not immediately — pausing mid-fade
         freezes a frame in full view. Re-checked on the timeout because a
         fast scroll back can make this layer live again before it fires. */
      setTimeout(() => {
        if (!prev.classList.contains("is-live")) prev.pause();
      }, fadeMs());
    }
  };

  /* The CSS scroll timeline owns this transition wherever it exists; this JS
     path is the fallback (Firefox today). Running both would mean two things
     writing the same inline styles on every frame. */
  const cssDrivesHero = CSS.supports("animation-timeline", "scroll()");

  if (hero && media && win && !cssDrivesHero) {
    /* Read the window's real size from CSS rather than hardcoding 245/340 —
       the breakpoint owns those numbers, not this file. */
    const target = () => {
      const r = win.getBoundingClientRect();
      return { w: r.width, h: r.height };
    };

    let handedOver = null;   /* null until we know which side we are on */

    const frame = () => {
      const vh = window.innerHeight;
      const p  = Math.min(1, Math.max(0, window.scrollY / vh));
      const t  = target();

      /* Interpolate the media box from the full stage to the window. */
      /* The video starts BELOW the accent band (Figma has it at y=12), so the
         start height is the stage minus the band and the start top is the
         band itself — not 0. Interpolating from 0 would slide the video up
         under the green strip for the whole transition. */
      const band = parseFloat(getComputedStyle(document.documentElement)
                     .getPropertyValue("--nav-band")) || 12;
      const vw = window.innerWidth;

      const w = (1 - p) * vw + p * t.w;
      const h = (1 - p) * (vh - band) + p * t.h;

      media.style.width  = w + "px";
      media.style.height = h + "px";
      media.style.left   = ((vw - w) / 2) + "px";
      media.style.top    = ((1 - p) * band + p * ((vh - t.h) / 2)) + "px";

      /* The wordmark shrinks on the same curve. 0.26 is the panel wordmark
         against the hero wordmark, measured from the Figma frames. */
      if (mark) mark.style.scale = (1 - p * 0.74).toFixed(4);

      /* Hand over at the end of the runway: the animated hero goes, the fixed
         window and the nav arrive. Guarded so we only touch the DOM on the
         transition, not on every frame. */
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

    /* rAF coalesces the work to one call per painted frame — but it does NOT
       run while the document is hidden, and a handler that defers everything
       to it stops updating entirely in a background tab, leaving `ticking`
       latched true. So rAF is used only when there is actually a frame
       coming; otherwise the work runs inline. */
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

  /* ---- 2. The window's word ---------------------------------------------
     Each plate and each benefit declares the section it belongs to. Whichever
     is nearest the middle of the viewport owns the word. Using the midpoint
     rather than IntersectionObserver thresholds means the swap lands when the
     section is actually behind the window, which is where the window is. */
  /* With the CSS path live, the window and nav are revealed by the timeline,
     but the window's video still needs starting once it is actually on. */
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

  /* When the section changes.

     The trigger is the WORD'S OWN HORIZONTAL LINE, not the window box. The word
     and the video rotate to the next section at the moment the word sits on the
     same line as the START (top edge) of the incoming section — i.e. when that
     section's top edge rises to the vertical centre of the word. Earlier rules
     were wrong about this: "nearest the viewport middle" swapped while the
     previous section still filled the screen; "100px scrolled into the panel"
     measured from the viewport top; and using the panel's BOTTOM edge fired the
     swap as soon as the section first touched the foot of the window (~240px
     too early), long before the word met it.

     DIP nudges the line: 0 fires exactly on the word's centre; raise it to make
     the section commit a little further past the word before the swap. */
  const DIP = 0;

  /* What the panel says before you have entered any section. */
  const INTRO_WORD = "Mayfield";

  const wordBox = document.querySelector(".window__word");

  if (track && zones.length && wordBox) {
    let current = "";
    let remeasureTrack = () => {};   /* set by the scroll-jacked marquee below */

    const pick = () => {
      /* The word's horizontal centre-line, measured live so it stays right
         across breakpoints (the panel is 245x400 on mobile, 340x480 up). The
         swap fires when the next section's top edge reaches this line. */
      const wb = wordBox.getBoundingClientRect();
      const edge = wb.top + wb.height / 2 - DIP;

      /* No default to zones[0]. Until the box has dipped into the FIRST
         section, the panel still reads MAYFIELD — which is what the hero's
         wordmark shrinks down into, and what the Figma panel mock (214:2829)
         shows with the WORK marquee parked off-panel at left-full, waiting to
         slide in. Defaulting to the first section meant the panel read WORK
         from the very first frame, so the MAYFIELD -> WORK change appeared to
         happen instantly while every later change was correctly timed. */
      let best = null;
      for (const z of zones) {
        if (z.getBoundingClientRect().top <= edge) best = z;
      }

      const word = best ? best.dataset.word : INTRO_WORD;
      /* The intro word sits still and centred; the section words marquee. */
      wordBox.classList.toggle("is-intro", !best);
      if (word && word !== current) {
        current = word;
        /* Six copies: three fill the track, three duplicate it so the -50%
           keyframe loops without a visible reset. */
        track.replaceChildren(...Array.from({ length: 6 }, () => {
          const s = document.createElement("span");
          s.textContent = word;
          return s;
        }));
        remeasureTrack();   /* the word changed, so the loop period changed */

        /* The footage turns with the word, on this same beat. It is driven
           from `word` rather than from `best` so the intro state is not a
           special case: INTRO_WORD names a layer like any section does, and
           scrolling back above the first section returns the window to the
           hero cut on its own. */
        showCut(word);
      }
    };

    addEventListener("scroll", pick, { passive: true });
    addEventListener("resize", pick);
    pick();

    /* ---- Scroll-jacked marquee -----------------------------------------
       The section word no longer runs at a constant speed. Its horizontal
       travel is DRIVEN BY THE SCROLL GESTURE: scrolling down cycles it
       left -> right, scrolling up right -> left. A smoothed velocity eases
       every change of direction so a flick never snaps, and the travel decays
       to rest when you stop scrolling. The CSS @keyframes marquee stays as the
       no-JS fallback (`.js .window__track` disables it); with JS on we own the
       transform here. Skipped for prefers-reduced-motion — the word sits still.
       -------------------------------------------------------------------- */
    const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
    if (!reduceMQ.matches) {
      track.style.willChange = "transform";

      let rw = 0;                 /* width of one seamless repeat (px) */
      remeasureTrack = () => { rw = track.scrollWidth / 2; };

      let x = 0;                  /* current translateX, kept within (-rw, 0] */
      let v = 0;                  /* eased velocity actually applied (px/frame) */
      let want = 0;               /* velocity the gesture is asking for */
      let lastY = window.scrollY;

      const GAIN  = 0.11;         /* word travel per px scrolled — subtle */
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

  /* ---- 2b. Parking the window -------------------------------------------
     The window is fixed to the viewport centre, which until now meant it rode
     the scroll all the way to the bottom of the page and floated on over the
     Instagram bed and the footer. The last benefit panel is where it has said
     everything it has to say, so that is where it gets left behind: once its
     centre meets the centre of that panel, it stops travelling with the
     gesture and scrolls away with the page like anything else.

     The stop is an offset applied to the still-fixed element, NOT a switch to
     position:absolute. Same reasoning as the hero handing over to a second
     element rather than re-positioning itself: changing `position` under a
     scrolling user reflows and jumps. Here the box never moves in the layout
     at all — only its translate changes, so the whole thing stays on the
     compositor and the handover is invisible.

     The anchor is the LAST .benefit rather than a named section: "the final
     white row" is the rule, and reading it from the DOM means re-ordering or
     adding a section cannot leave this pointing at the wrong one. */
  const lastBenefit = [...document.querySelectorAll(".benefit")].pop();

  if (win && lastBenefit) {
    /* Scroll position at which the panel's centre sits on the viewport's
       centre — i.e. exactly where the window already is. Measured live so it
       survives breakpoint changes and late-loading imagery above it. */
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

  /* ---- 3. Menu ----------------------------------------------------------
     "the word mayfield scales up, so it all feels quite tied together" — the
     overlay grows from the nav mark rather than sliding in. */
  /* ---- 3. Menu ----------------------------------------------------------
     The bar and the menu are one element, and every moving part is derived
     from --menu-p in CSS, so there is nothing here to animate: this just
     flips the state and keeps --seat-s honest.

     --seat-s is the only number CSS cannot work out for itself — the ratio
     between the wordmark at bar size and at full size, which depends on the
     viewport. Measured once, and again on resize. */
  /* `nav` is already in scope from the hero handover above. */
  const navToggle = document.getElementById("navToggle");
  const navMark   = document.querySelector(".nav__mark");
  const SEAT_W    = 88;   /* [figma 190:11489] the wordmark in the 36px bar */

  const measureSeat = () => {
    if (!navMark) return;
    /* The untransformed width — getBoundingClientRect would report it scaled
       by whatever --seat-s currently is, which would compound on every call. */
    const full = navMark.offsetWidth;
    if (full) document.documentElement.style.setProperty("--seat-s", (SEAT_W / full).toFixed(5));
  };
  measureSeat();
  addEventListener("resize", measureSeat);

  if (navToggle && nav) {
    const root = document.documentElement;
    /* The four menu panels are video. They are preload="none" and only start
       when the menu opens, so nothing downloads four clips on page load; they
       pause again on close so a hidden menu is not decoding video. */
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
    /* The hero carries its own MENU button, over the video. It was left
       unwired by the nav/menu merge, so at the top of the page — which is
       where anyone starts — there was nothing that opened the menu. */
    document.querySelectorAll("[data-menu-open]").forEach(b => b.addEventListener("click", toggle));
    nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setOpen(false)));
    addEventListener("keydown", e => {
      if (e.key === "Escape" && root.classList.contains("menu-open")) setOpen(false);
    });
  }

  /* ---- 3b. Interior-page bar reveal -------------------------------------
     Pages that open on a .phero video header (Spaces/Park/Republic) have no
     hero->window handover to bring the persistent bar in, so reveal it once
     the header has scrolled past. Where the CSS scroll-timeline runs it already
     animates the bar in; this is the fallback, and it also keeps the bar off
     the hero at the top. Skipped where the bar is static (Contact). */
  const phero = document.querySelector(".phero");
  if (phero && nav && !nav.classList.contains("nav--static")) {
    new IntersectionObserver(([e]) => {
      nav.classList.toggle("is-live", !e.isIntersecting);
    }, { threshold: 0 }).observe(phero);
  }

  /* ---- 4b. The power of Mayfield ----------------------------------------
     A curated quote deck with a live Google rating above it. The quotes are
     ours; only the score and the star fill come from the API.

     Deliberately NOT the review text from the listing: showing that would pull
     in per-review attribution obligations (author avatar, name, profile link,
     a link to the review, and a notice explaining any reordering), and would
     put whatever Google promotes into its top five on the homepage unreviewed.
     An aggregate rating needs only that Google is credited.
     ---------------------------------------------------------------------- */
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

    /* The star row is drawn twice — outlines behind, solids in front — and the
       solid layer is clipped to the score. A rect width is exact at any
       fraction, where a half-star glyph could only ever land on .0 and .5. */
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

  /* ---- 5. Link hover ----------------------------------------------------
     A rule that enters from the side the pointer crossed and leaves by the
     other. The type itself stays put.

     Delegated on `pointerover`, NOT `pointerenter` per link: pointerenter and
     pointerleave do not bubble, so every link would need its own pair and any
     missed leave strands a drawn rule under a link nobody is touching.
     pointerover bubbles and fires for every element crossed, so the active
     link is re-derived from where the pointer actually is.
     ---------------------------------------------------------------------- */
  /* The nav wordmark is a logo, not a text link — no rule under it. */
  const LINKS = ".nav__links a, .foot__links a, .foot__legal a, .insta__text a";
  const links = document.querySelectorAll(LINKS);

  if (links.length) {
    document.documentElement.classList.add("js-underline");

    links.forEach((link) => {
      link.classList.add("u-link");

      /* Wrap the text so the bar is a sibling of it rather than inside the
         same box — the bar is positioned against the link, the text is not
         touched at all. */
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

    /* The cases where no pointerover follows: the cursor leaving the window,
       the tab losing focus, a touch being cancelled mid-gesture. */
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

  /* ---- 4. Weather ---------------------------------------------------------
     The site's colour is the weather, not the brand: overcast green, sunny
     orange, rain blue, frost teal, and a night mode that ignores weather
     entirely once the sun is down.

     The state comes from /v2/api/weather — a Pages Function that proxies the
     Google Weather API and reduces its 40 condition types to these five. It
     is a Function rather than a fetch from here because the Google key would
     otherwise be public in this file.

     ?weather= and ?mode= still win, and are forwarded to the Function so the
     icon and the word come back right too — a state can be reviewed whole
     rather than just recoloured.
     ---------------------------------------------------------------------- */
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
    /* The readout is a bare degree sign, so the value has to be Celsius —
       the Function converts before sending rather than trusting the unit.
       When there is no reading the field stays empty: the icon still says what
       the sky is doing, and an invented number would be worse than silence. */
    const reading = typeof temperature === "number" ? `${temperature}\u00b0` : "";
    document.querySelectorAll("#navTemp, #heroTemp").forEach((el) => {
      el.textContent = reading;
    });

    /* Icon where one has been drawn, the condition's name where one has not.
       Lending the cloud to rain or frost reads as a wrong forecast rather
       than a missing asset, so the word stands in until the set is complete. */
    document.querySelectorAll(".nav__temp, .hero__meta .temp").forEach((box) => {
      const glyph = box.querySelector(".wx-icon");
      const word = box.querySelector(".wx-word");
      if (!glyph || !word) return;
      if (icon) {
        /* A custom property, not `src`: the glyph is a mask so that it takes
           the colour of the text beside it — black in the nav, white in the
           hero — from one asset.

           The URL is made ABSOLUTE first. A url() inside a custom property is
           resolved against the stylesheet that consumes it, not the document,
           so a relative path here went looking under /v2/css/ and silently
           found nothing — and Cloudflare answers unknown paths with a 200 HTML
           page, so it did not even fail loudly. An invalid mask image paints
           nothing, which is why the icons were missing while everything else
           on the badge was fine. */
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

  /* Relative, so it resolves under /v2/ wherever the build is served from.
     Any failure leaves the page on the design's default rather than blocking
     it on weather it could not get. */
  /* Nothing is shown until this resolves, so the reveal has to happen on every
     path — success, a bad response, or an outright network failure. A badge
     that never appears would be a worse bug than the flicker this replaces. */
  const reveal = () => root.classList.add("wx-ready");

  fetch("api/weather" + location.search, { headers: { accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d) paint(d); })
    .catch(() => {})
    .finally(reveal);

  /* And a backstop: if the request hangs rather than failing, the time should
     not be held hostage to it. */
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

  /* ---- 5b. Five-day forecast strip (park page) --------------------------
     Fills the .wxstrip from /api/weather?days=N. The markup ships with a static
     placeholder so the strip reads fine with no JS or when the API is
     unavailable; this overwrites each row's day, icon and high once live data
     arrives, and quietly leaves the placeholder if not. */
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

  /* ---- 6. Contact form --------------------------------------------------
     Progressive enhancement, nothing more. The form already posts to
     /v2/api/contact and validates natively with scripting off; this keeps the
     confirmation on the page instead of navigating to the Function's own reply.

     It sends the same fields as the native post (a FormData body the Function
     reads either way) but asks for JSON, so the Function answers with data
     rather than its no-JS HTML page.
     ---------------------------------------------------------------------- */
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
      /* Let the browser's own required/email bubbles do the front-line check;
         only take over once the fields are actually valid. */
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
            /* The form is done — swap it for the confirmation rather than
               leaving spent fields on screen. */
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

  /* ---- 7. Gallery — 3D dropping stack -----------------------------------
     Transposed from paulkalkbrenner.net's `dropping-stack`: the active image is
     front and centre; the rest recede UP and BACK in Z (perspective shrinks
     them), each a step higher with a lower z-index, darkening as they drop away.
     Paged by Prev/Next, by clicking the front card, or by dragging it. With no
     JS the CSS `:first-child` shows the first image, so this only enhances.

     VISIBLE is how many cards read in the stack; deeper ones sit hidden behind
     the front (opacity 0) so a long set never turns into a thick slab. */
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
      /* Only the front card takes the pointer; the rest never intercept it. */
      s.style.pointerEvents = d === 0 ? "auto" : "none";
      s.setAttribute("aria-hidden", d === 0 ? "false" : "true");
    };

    const layout = (except) => {
      slides.forEach((s) => { if (s !== except) place(s, depthOf(s)); });
      if (count) count.textContent = `${active + 1}/${n}`;
    };

    /* Commit styles to a slide with the transition suppressed — used for the
       invisible reset of a dropped card and the off-screen start of an
       incoming one, so neither of those jumps is ever animated on screen. */
    const snap = (s, fn) => {
      const prev = s.style.transition;
      s.style.transition = "none";
      fn();
      void s.offsetWidth;
      s.style.transition = prev;
    };

    /* Fire once the slide's transform transition ends (with a timeout backstop
       so a dropped frame can never leave the gallery locked). */
    const afterMove = (s, cb) => {
      let done = false;
      const fin = () => { if (done) return; done = true; s.removeEventListener("transitionend", te); cb(); };
      const te = (e) => { if (e.propertyName === "transform") fin(); };
      s.addEventListener("transitionend", te);
      setTimeout(fin, 900);
    };

    /* NEXT — the front card FALLS straight down and off, fading as it goes (the
       signature drop from the reference: front -> translateY 230% + fade). The
       rest of the stack steps forward one depth and a new card fades in at the
       back. When the fall ends the card is snapped, invisibly, to the back. */
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

    /* PREV — a card DROPS IN from the top to become the new front (mirror of the
       fall): it starts off-screen above and eases down into the front slot while
       the stack steps back one depth. */
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

    /* Drag / click the front card. A short travel is a click (advance); a real
       drag pages on release once it passes the threshold, direction from the
       drag vector (up/left = next, down/right = prev). Pointer Events so mouse
       and touch share one path; the front card is the only one with
       pointer-events, so a pointerdown on the stack is always on it. */
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

  /* ---- 8. Republic floors — hover swaps the building render -------------
     Each floor row carries a data-render; pointing at it fades the left image
     to that render. Enhancement only — the table reads fine without it, and
     the default render stands with no JS. */
  const floorsBox = document.querySelector(".floors__img");
  if (floorsBox && floorsBox.querySelector("img")) {
    const rows = [...document.querySelectorAll(".floor[data-render]")];
    /* Preload the distinct renders so a swap never waits on the network. */
    [...new Set(rows.map((r) => r.dataset.render))].forEach((s) => { const i = new Image(); i.src = s; });
    /* Two stacked layers that cross-fade, so the render dissolves rather than
       hard-cutting (which read as jumpy). */
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
      /* decode() resolves once (even when cached), so the fade fires exactly
         once — the old onload+complete pair double-fired and blanked both layers. */
      if (back.decode) back.decode().then(reveal, reveal);
      else back.onload = reveal;
    };
    rows.forEach((row) => {
      row.addEventListener("pointerenter", () => swap(row.dataset.render));
      row.addEventListener("focusin", () => swap(row.dataset.render));
    });
  }

  /* ---- 10. Location list — the map follows the cursor with a swing -------
     Transposed from hellohello.is: hovering a row reveals its image, which then
     TRAILS the pointer (a lerp lag) and ROTATES from its own horizontal velocity
     so it swings like it hangs off the cursor. Desktop + fine-pointer only; the
     CSS keeps the map hidden otherwise. */
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

  /* ---- 9. FAQ accordion — control at the foot of each row ---------------
     Native <details> could neither put the control under the answer nor animate
     the open/close height, so this is a light accordion: the button toggles
     `.is-open` and the CSS grid-rows trick animates both directions. Fully
     progressive — with no JS the panels are open (CSS), so every answer reads. */
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

  /* ---- 11. Benefit panels — pinned stacking deck -----------------------
     The .bpanels section is a tall scroll runway; its .bpanels__pin wrapper is
     sticky, so it stays put while the user scrolls through the runway. Over that
     distance each card slides up from below and stacks, the earlier ones scaling
     back (-STEP) and lifting (-PEEK) as later cards land on top. Once all are
     stacked (progress 1) the sticky pin releases and the whole deck scrolls away
     as one. Technique from sohub.digital (GSAP pin) rebuilt in vanilla JS.
     [design ref 2026-09-17] */
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
      const TOP = vh < 800 ? 48 : 60;                  // [figma] first card sits this far
      const PEEK = vh < 800 ? 34 : 44;                 // from the section top; peek per card
      const ENTER = vh;                                // how far below a card starts
      // "fill" runs 1 → N across the runway: the first card is already present (anchored
      // near the top, per Figma) when the section pins — no empty lead-in — and each
      // later card then slides up and lands a little lower, the earlier ones scaling back.
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

  /* ---- 12. Character reveal on scroll ----------------------------------
     SplitText-style, vanilla. Splits titles/body/paragraphs into per-character
     spans and reveals them (fade + rise, staggered) when each element scrolls
     into view. Recurses only text nodes, so nested markup (the title zig-zag
     spans, the inline Republic logo, <em> accents, links) survives. Skips the
     header, footer, sticky nav, the window video span and the stacking cards.
     [ref codepen bGEqbaQ — GreenSock "SplitText reveal each character"] */
  (() => {
    if (reduced) return;
    /* Excludes: footer, the nav (sticky + initial), the window video span, the
       stacking cards, the flag, the destination cards, the weather strip, and the
       home/Republic heroes (they have their own motion). The .phero video-header
       titles ARE included. Locations join via .rloc__name/.rloc__time. */
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
            /* Split on whitespace but keep it: each word becomes a nowrap span of
               chars, and the spaces stay as text so lines only break between words. */
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
      /* Keep the plain text as the accessible name so screen readers don't read
         it out one character at a time. */
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

  /* ---- 13. The button roll ----------------------------------------------
     Every button in the system rolls on hover: the label shoots up and out
     while an identical copy rises into the gap. The movement is CSS
     (components.css §7); what it needs from here is the second copy.

     Built rather than written into the markup because a roll needs the label
     twice, and a label that lives in two places in five HTML files is a label
     that will eventually disagree with itself. Buttons that already carry
     their own structure are left alone — .btn--brochure rolls just its arrow
     and has the two cells in the markup already — which is what the
     firstElementChild check is for: it means "someone has composed this one
     deliberately", not a list of class names to keep in sync.

     Icon-only buttons (.dest__icon) need nothing here; with no text to copy,
     their two cells are pseudo-elements and the whole roll is CSS. */
  /* A function DECLARATION, not a const: it hoists, so the contact form in §6
     can call it even though it is written further up the file. Anything that
     changes a button's label must go through here, or it replaces the roll
     with a bare text node and the button silently stops rolling. */
  function rollLabel(btn, text) {
    const label = text !== undefined ? text : btn.textContent.trim();
    if (!label) return;

    const roll  = document.createElement("span");
    const track = document.createElement("span");
    roll.className  = "btn__roll";
    track.className = "btn__roll-track";

    /* The second copy is decorative: it must not reach the accessible name,
       or every button on the site reads its label twice. */
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

})();
