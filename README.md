# MindPill — pop-up form test site

Static clone of the MindPill demo site (landing, waitlist, store, checkout), wired to the
**Sandbox Ayoub** Brevo tracker (`client_key` `fwd1i68m6k388az7fch1z34x`). Google Tag Manager removed.
Used to test Pop-up Forms segmentation by list / contact attribute.

On waitlist submit and checkout the site calls `Brevo.identify()` and sets `PLAN`, `SOURCE`,
`LAST_ORDER_*`, `FAV_PRODUCT`. Custom attributes must exist in the Brevo account first.

Preview: `python3 -m http.server 8000` then http://localhost:8000
