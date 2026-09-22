/* Cookie consent: GTM loads only after Accept, nothing fires before. Choice kept 12 months. */
(function () {
  var KEY = "mayfield-consent";
  var GTM_ID = "GTM-53C9PGF8";
  var MAX_AGE = 365 * 24 * 60 * 60 * 1000;

  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY));
      return c && Date.now() - c.t < MAX_AGE ? c.v : null;
    } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: v, t: Date.now() })); } catch (e) {}
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }

  function loadGtm() {
    if (window.__gtmLoaded) return;
    window.__gtmLoaded = true;
    gtag("consent", "default", {
      analytics_storage: "granted", ad_storage: "granted",
      ad_user_data: "granted", ad_personalization: "granted"
    });
    dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtm.js?id=" + GTM_ID;
    document.head.appendChild(s);
  }

  // Withdrawing consent: stop tags and clear Google's cookies on this domain and its parent.
  function clearGoogle() {
    gtag("consent", "update", {
      analytics_storage: "denied", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied"
    });
    var host = location.hostname.split(".");
    var domains = ["", host.slice(-2).join("."), host.slice(-3).join(".")];
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (!/^(_ga|_gid|_gat|_gcl)/.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + "=; Max-Age=0; path=/" + (d ? "; domain=." + d : "");
      });
    });
  }

  // Same markup motion.js builds for the .btn roll.
  function btn(label, value) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.dataset.consent = value;
    b.innerHTML = '<span class="btn__roll"><span class="btn__roll-track"><span>' + label +
      '</span><span aria-hidden="true">' + label + "</span></span></span>";
    return b;
  }

  var banner;
  function show() {
    if (banner) { banner.hidden = false; banner.querySelector("button").focus(); return; }
    banner = document.createElement("section");
    banner.className = "cookies";
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML =
      '<p class="cookies__text">We use analytics cookies to understand how people use this site. ' +
      "They only run if you accept. You can change your mind any time from Cookie settings in the footer.</p>";
    var actions = document.createElement("div");
    actions.className = "cookies__actions";
    actions.append(btn("Reject", "denied"), btn("Accept", "granted"));
    banner.append(actions);
    actions.addEventListener("click", function (e) {
      var b = e.target.closest("[data-consent]");
      if (!b) return;
      var v = b.dataset.consent;
      if (v === "granted") loadGtm(); else if (read() === "granted") clearGoogle();
      save(v);
      banner.hidden = true;
    });
    document.body.append(banner);
  }

  if (read() === "granted") loadGtm();

  document.addEventListener("DOMContentLoaded", function () {
    if (!read()) show();
    document.querySelectorAll("[data-cookie-settings]").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); show(); });
    });
  });
})();
