# Ergabaker website outcomes

- Build a responsive RTL homepage at `/` with the SEO title `ارگابکر | انجیر استهبان و انجیر خشک`, a Persian meta description, H1, the brand slogan `ارگانیک بکر`, product introduction, the `چرا انجیر استهبان؟` section, product-size navigation, a simple buying flow, and explicit CTAs for product purchase, price enquiry, wholesale purchase, and direct phone contact at `۰۹۱۷۰۱۶۸۰۳۷`.
- Build a responsive RTL wholesale page at `/wholesale/` with its own SEO title/meta description/H1, wholesale copy, an enquiry form with name, phone, city, requested type/size, approximate quantity, and a direct call CTA; the form must provide clear client-side feedback without claiming to save data remotely.
- Add an internal `/dried-fig-types/` page linked from the homepage so product-size information has a stable destination and current stock can be confirmed by phone.
- Keep all copy free of unsupported claims such as organic certification, export status, first-grade status, or Google ranking claims; use transparent wording around availability and phone confirmation.
- Make navigation, buttons, form labels, and copy legible in Persian with a fully RTL layout and mobile-friendly behavior.
- Serve `public/manus-routes.json` with the complete page route set and run the application on `0.0.0.0:3000` for the Webdev preview.


- Add an all-visitors `/pay/` page with a Persian payment form for amount in تومان, customer name, phone, optional email, and order description; the client must call a same-origin server endpoint and redirect only to a gateway URL returned by that server.
- Integrate ZarinPal v4 on the server with sandbox as the default mode, server-held merchant credentials, a callback route, amount-matched verification, idempotent handling of repeated verification status, and success/failure result pages without storing card data.
- Persist payment order state (order ID, amount in Rial/Toman, authority, status, provider code, reference ID, and timestamps) in the managed MySQL-compatible database rather than process memory or container files.
- Add a production Dockerfile, `/api/health` endpoint, build configuration, and deploy configuration so the payment-enabled server can be published after credentials and public origin are supplied.


- Harden payment operations: prevent paid orders from being downgraded by replayed callbacks, require and validate an HTTPS public origin in every environment, rate-limit payment initiation, make `/api/health` check database readiness, and exclude `.env`, `.git`, and local dependencies from repository/container contexts.
- Before live or sandbox payment testing, set the protected `ZARINPAL_MERCHANT_ID`, set `PUBLIC_ORIGIN` to the exact browser-visible HTTPS origin, confirm the managed database is reachable, and keep `ZARINPAL_MODE=sandbox` until the complete request → redirect → callback → verify flow has been tested.
