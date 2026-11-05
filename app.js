/* MindPill store — cart + Brevo tracking helpers
   Brevo custom events: https://developers.brevo.com/docs/track-custom-events-js
   Brevo.push(["track", event_name, properties, event_data]) */

const CART_KEY = "mindpill_cart";
const EMAIL_KEY = "mindpill_email";
const EXT_ID_KEY = "mindpill_ext_id";

const PRODUCTS = {
  "tee-think":   { name: "\"I Think Therefore I Am (Updated)\" Tee", price: 29, emoji: "🧠", category: "Tees", blurb: "Descartes, patched. A soft-touch cotton tee for the recently upgraded." },
  "tee-pill":    { name: "Big Pill Energy Tee",                       price: 29, emoji: "💊", category: "Tees", blurb: "One capsule, infinite confidence. Wear your dose on your chest." },
  "tee-opus":    { name: "Powered by Opus Tee",                       price: 32, emoji: "⚡", category: "Tees", blurb: "Premium heavyweight tee for those running the latest model inside." },
  "tee-dream":   { name: "Debugging In My Sleep Tee",                 price: 29, emoji: "🌙", category: "Tees", blurb: "For the ones who ship fixes between REM cycles." },
  "tee-95":      { name: "Fluent in 95 Languages Tee",               price: 32, emoji: "🗣️", category: "Tees", blurb: "Say it in any tongue. This tee only speaks one: comfort." },
  "tee-recall":  { name: "Total Recall Tee",                          price: 29, emoji: "📚", category: "Tees", blurb: "Never forget leg day again. Or anything else, ever." }
};

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
}
function cartCount(cart) {
  cart = cart || getCart();
  return Object.values(cart).reduce((n, q) => n + q, 0);
}
function cartTotal(cart) {
  cart = cart || getCart();
  return Object.entries(cart).reduce((t, [id, q]) => t + (PRODUCTS[id] ? PRODUCTS[id].price * q : 0), 0);
}
function getEmail() { try { return localStorage.getItem(EMAIL_KEY) || ""; } catch (e) { return ""; } }
function setEmail(v) { try { localStorage.setItem(EMAIL_KEY, v); } catch (e) {} }
function getExtId() { try { return localStorage.getItem(EXT_ID_KEY) || ""; } catch (e) { return ""; } }
function setExtId(v) { try { localStorage.setItem(EXT_ID_KEY, v); } catch (e) {} }

/* Build the event_data.data.items array Brevo expects */
function cartItems(cart) {
  cart = cart || getCart();
  return Object.entries(cart).map(([id, q]) => ({
    name: PRODUCTS[id] ? PRODUCTS[id].name : id,
    price: PRODUCTS[id] ? PRODUCTS[id].price : 0,
    quantity: q
  }));
}

/* ---- Google Tag Manager dataLayer (GA4 ecommerce schema) ----
   These run alongside the Brevo events so GTM can forward them (GA4, ads, etc.).
   GA4 ecommerce reference: https://developers.google.com/analytics/devguides/collection/ga4/ecommerce */
function dl() { window.dataLayer = window.dataLayer || []; return window.dataLayer; }

function gaItem(id, quantity) {
  const p = PRODUCTS[id] || {};
  return { item_id: id, item_name: p.name, price: p.price, item_category: p.category, quantity: quantity || 1 };
}
function gaItemsFromCart(cart) {
  cart = cart || getCart();
  return Object.entries(cart).map(([id, q]) => gaItem(id, q));
}
function pushEcommerce(eventName, ecommerce) {
  dl().push({ ecommerce: null });                  // clear the previous ecommerce object
  dl().push({ event: eventName, ecommerce: ecommerce });
}

/* Send an enriched page view with a meaningful name + properties.
   Reserved ma_ keys (ma_title/ma_url/ma_path/ma_referrer) plus any custom props.
   https://developers.brevo.com/docs/track-page-views-js */
function trackPage(pageName, extraProps) {
  const props = Object.assign({
    ma_title: document.title,
    ma_url: window.location.href,
    ma_path: window.location.pathname,
    page_source: "mindpill_site"
  }, extraProps || {});
  window.Brevo = window.Brevo || [];
  Brevo.push(["page", pageName, props]);
}

/* Identify the visitor so their cookie is tied to a real contact.
   All subsequent events (page views, cart_updated, order_created) attach to this contact.
   https://developers.brevo.com/docs/identify-users-js */
function identifyContact(email, attributes) {
  if (!email) return;
  setEmail(email);
  setExtId((attributes && attributes.EXT_ID) || "");   // EXT_ID is the reserved attribute key for ext_id
  window.Brevo = window.Brevo || [];
  Brevo.push([
    "identify",
    {
      identifiers: { email_id: email },
      attributes: attributes || {}   // FIRSTNAME/LASTNAME exist by default; custom attrs must be created in Brevo first
    }
  ]);
}

/* Fire Brevo "cart_updated" */
function trackCartUpdated() {
  const cart = getCart();
  const email = getEmail();
  const properties = email ? { email: email } : {};
  window.Brevo = window.Brevo || [];
  Brevo.push([
    "track",
    "cart_updated",
    properties,
    {
      id: "cart:mindpill",
      data: {
        total: cartTotal(cart),
        currency: "USD",
        item_count: cartCount(cart),
        items: cartItems(cart)
      }
    }
  ]);
}

/* Fire Brevo "order_created" */
function trackOrderCreated(orderId, email, shippingTotal) {
  const cart = getCart();
  window.Brevo = window.Brevo || [];
  Brevo.push([
    "track",
    "order_created",
    email ? { email: email } : {},
    {
      id: "order:" + orderId,
      data: {
        total: cartTotal(cart) + (shippingTotal || 0),
        currency: "USD",
        item_count: cartCount(cart),
        items: cartItems(cart)
      }
    }
  ]);
}

function addToCart(id) {
  const cart = getCart();
  cart[id] = (cart[id] || 0) + 1;
  saveCart(cart);
  trackCartUpdated();                              // Brevo
  pushEcommerce("add_to_cart", {                   // GTM / GA4
    currency: "USD",
    value: PRODUCTS[id] ? PRODUCTS[id].price : 0,
    items: [gaItem(id, 1)]
  });
  updateCartBadges();
}
function setQty(id, qty) {
  const cart = getCart();
  const prev = cart[id] || 0;
  if (qty <= 0) { delete cart[id]; } else { cart[id] = qty; }
  saveCart(cart);
  trackCartUpdated();                              // Brevo
  // GTM / GA4: reflect the direction of the change
  const price = PRODUCTS[id] ? PRODUCTS[id].price : 0;
  if (qty > prev) {
    pushEcommerce("add_to_cart", { currency: "USD", value: price, items: [gaItem(id, qty - prev)] });
  } else if (qty < prev) {
    pushEcommerce("remove_from_cart", { currency: "USD", value: price, items: [gaItem(id, prev - qty)] });
  }
  updateCartBadges();
}

function updateCartBadges() {
  const n = cartCount();
  document.querySelectorAll("[data-cart-count]").forEach(el => {
    el.textContent = n;
    el.style.display = n > 0 ? "inline-flex" : "none";
  });
}

function showToast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---- Connect / Logout (test aid) ----
   The Brevo tracker keeps the visitor in the "sib_cuid" cookie and only reads/creates it
   when sa.js boots (see https://sibautomation.com/sa.js). So to switch person we:
     1. delete sib_cuid, 2. reload the page (the tracker mints a fresh cookie),
     3. send identify for the new person on that fresh cookie.
   identify accepts email_id and/or ext_id as identifiers (sa.js); Brevo's docs
   (https://developers.brevo.com/docs/identify-users-js) only document email_id as required,
   so an ext_id-only connect works only if the contact already exists with that ext_id. */
const PENDING_KEY = "mindpill_pending_identify";
const TRACKER_COOKIE = "sib_cuid";

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}
function resetTrackerCookie() {
  const past = "expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/";
  const host = window.location.hostname;
  // the tracker sets it with domain=<hostname>; clear every variant to be safe
  [";domain=" + host, ";domain=." + host, ""].forEach(d => { document.cookie = TRACKER_COOKIE + "=;" + past + d; });
  try { localStorage.removeItem("BrevoTracker.identifyCalledDate"); } catch (e) {}
}

/* The pop-up SDK (WonderPush, loaded by the Brevo tracker) keeps its own install and a
   "brevoIdentify" record whose identifiers are merged with every identify call. It lives
   outside sib_cuid, so without this reset the device stays tied to the previous contact
   (pop-up targeting and identify keep the old email). clearAllData() starts a fresh install. */
function resetPopupSdk() {
  const wp = window.WonderPush;
  if (!wp || typeof wp.clearAllData !== "function") return Promise.resolve();
  return Promise.race([
    Promise.resolve().then(() => wp.clearAllData()).catch(() => {}),
    new Promise(r => setTimeout(r, 4000))
  ]);
}

function connectAs(email, extId) {
  if (!email && !extId) return;
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ email: email || "", extId: extId || "" })); } catch (e) {}
  setEmail(""); setExtId("");
  resetPopupSdk().then(() => {
    resetTrackerCookie();
    window.location.reload();
  });
}
function logout() {
  try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
  setEmail(""); setExtId("");
  resetPopupSdk().then(() => {
    resetTrackerCookie();
    window.location.reload();
  });
}

/* After the reload: identify the pending person on the brand-new cookie */
function flushPendingIdentify() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PENDING_KEY)); localStorage.removeItem(PENDING_KEY); } catch (e) {}
  if (!p || (!p.email && !p.extId)) return;
  setEmail(p.email); setExtId(p.extId);
  const identifiers = {};
  if (p.email) identifiers.email_id = p.email;
  if (p.extId) identifiers.ext_id = p.extId;
  window.Brevo = window.Brevo || [];
  Brevo.push(["identify", {
    identifiers: identifiers,
    attributes: p.extId ? { EXT_ID: p.extId } : {}   // documented way to store EXT_ID on the contact
  }]);
}

/* Profile menu (top right of the header): "Sign in" opens a small panel (email and/or ext_id);
   once connected it shows an avatar with a check and "Authenticated as …" (no log out:
   switching person needs a fresh browser profile, the pop-up SDK stays tied to the first contact).
   It shows what the site last sent to Brevo.identify (kept in localStorage); the tracker
   can't read back which contact Brevo holds for the cookie. */
function renderProfile() {
  const nav = document.querySelector("header .nav");
  if (!nav) return;
  let root = document.getElementById("profile");
  if (!root) {
    root = document.createElement("div");
    root.id = "profile";
    root.className = "profile";
    nav.appendChild(root);
    document.addEventListener("click", e => { if (!root.contains(e.target)) root.classList.remove("open"); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") root.classList.remove("open"); });
  }
  const email = getEmail(), extId = getExtId(), cuid = getCookie(TRACKER_COOKIE);
  const connected = !!(email || extId);
  const mk = (tag, props, kids) => { const el = Object.assign(document.createElement(tag), props || {}); (kids || []).forEach(k => el.appendChild(k)); return el; };
  const label = email || extId;
  root.textContent = "";
  root.classList.toggle("is-auth", connected);

  const trigger = mk("button", {
    type: "button", className: "profile-btn",
    title: connected ? "Authenticated as " + label : "Sign in",
    onclick: () => {
      root.classList.toggle("open");
      if (!root.classList.contains("open")) return;
      const c = getCookie(TRACKER_COOKIE);   // read now: sa.js sets it after first render
      root.querySelectorAll(".profile-cookie").forEach(el => { el.textContent = "Tracker cookie: " + (c ? c.slice(0, 8) + "…" : "(not set yet)"); });
      const f = root.querySelector("input"); if (f) f.focus();
    }
  });
  trigger.setAttribute("aria-haspopup", "true");
  if (connected) {
    trigger.appendChild(mk("span", { className: "avatar", textContent: label.charAt(0).toUpperCase() }, [mk("span", { className: "avatar-check", textContent: "✓" })]));
  } else {
    trigger.appendChild(mk("span", { className: "avatar avatar-anon", innerHTML: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>' }));
    trigger.appendChild(mk("span", { className: "profile-label", textContent: "Sign in" }));
  }
  root.appendChild(trigger);

  const panel = mk("div", { className: "profile-panel" });
  const cookieLine = mk("p", { className: "profile-meta profile-cookie", textContent: "Tracker cookie: " + (cuid ? cuid.slice(0, 8) + "…" : "(not set yet)") });
  if (connected) {
    panel.appendChild(mk("p", { className: "profile-status", textContent: "✓ Authenticated" }));
    if (email) panel.appendChild(mk("p", { className: "profile-row", innerHTML: "<span>Email</span>" }, [mk("b", { textContent: email })]));
    if (extId) panel.appendChild(mk("p", { className: "profile-row", innerHTML: "<span>ext_id</span>" }, [mk("b", { textContent: extId })]));
    panel.appendChild(cookieLine);
  } else {
    const emailIn = mk("input", { type: "email", placeholder: "you@example.com", autocomplete: "off" });
    const extIn = mk("input", { placeholder: "ext_id", autocomplete: "off" });
    const err = mk("p", { className: "profile-err" });
    const form = mk("form", {
      onsubmit: e => {
        e.preventDefault();
        const em = emailIn.value.trim(), x = extIn.value.trim();
        if (!em && !x) { err.textContent = "Enter an email or an ext_id."; return; }
        connectAs(em, x);
      }
    }, [
      mk("p", { className: "profile-status", textContent: "Sign in" }),
      mk("label", { textContent: "Email" }, [emailIn]),
      mk("label", { textContent: "ext_id" }, [extIn]),
      err,
      mk("button", { type: "submit", className: "btn btn-primary profile-action", textContent: "Connect" })
    ]);
    panel.appendChild(form);
    panel.appendChild(mk("p", { className: "profile-meta", textContent: "Connecting resets the tracker cookie, then identifies you on the new one." }));
    panel.appendChild(cookieLine);
  }
  root.appendChild(panel);
}

document.addEventListener("DOMContentLoaded", updateCartBadges);
document.addEventListener("DOMContentLoaded", flushPendingIdentify);
document.addEventListener("DOMContentLoaded", renderProfile);
