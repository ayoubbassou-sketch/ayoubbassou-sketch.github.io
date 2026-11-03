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

/* Identity bar (test aid): shows who this site last identified to Brevo.
   The Brevo tracker has no documented way to read back the cookie's contact,
   so this is what the site last sent to Brevo.identify (kept in localStorage), not what Brevo holds. */
function renderIdentityBar() {
  let bar = document.getElementById("identity-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "identity-bar";
    bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#0b1220;color:#e5e7eb;font:13px/1.4 ui-monospace,Menlo,monospace;padding:8px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center";
    document.body.appendChild(bar);
  }
  const email = getEmail(), extId = getExtId();
  bar.textContent = "";
  const who = document.createElement("span");
  who.textContent = email
    ? "You are connected as email: " + email + " · ext_id: " + (extId || "(none sent)")
    : "Not identified on this site (anonymous cookie only)";
  bar.appendChild(who);

  const mk = (tag, props) => Object.assign(document.createElement(tag), props);
  const emailIn = mk("input", { placeholder: "email", value: email, size: 28 });
  const extIn = mk("input", { placeholder: "ext_id (optional)", value: extId, size: 18 });
  const idBtn = mk("button", { textContent: "Identify" });
  const clearBtn = mk("button", { textContent: "Forget" });
  idBtn.onclick = () => {
    const e = emailIn.value.trim(), x = extIn.value.trim();
    if (e) { identifyContact(e, x ? { EXT_ID: x } : {}); renderIdentityBar(); }
  };
  clearBtn.onclick = () => { setEmail(""); setExtId(""); renderIdentityBar(); };
  [emailIn, extIn, idBtn, clearBtn].forEach(el => { el.style.cssText += "font:inherit;padding:2px 6px"; bar.appendChild(el); });
}

document.addEventListener("DOMContentLoaded", updateCartBadges);
document.addEventListener("DOMContentLoaded", renderIdentityBar);
