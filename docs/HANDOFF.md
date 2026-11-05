# GetYourLawyer: handoff

## Layout

```
index.html, css/app.css, js/*.js   the whole app (core, auth, client, cases, chat, account, lawyer, main)
libs/leaflet/                      vendored map engine
manifest.json, sw.js, icon.svg     PWA (network-first service worker)
app/                               Android wrapper (Kotlin, package com.savro.getyourlawyer, SDK 24-35)
server/                            backend + admin portal
  server.js                        router, static files (/ app, /admin, /privacy, /terms), SSE
  routes_auth.js                   OTP, role, profile, photo, notifications, DigiLocker, ID upload, bot
  routes_client.js                 directory + map, slots, bookings, mock payments, case requests, reviews
  routes_lawyer.js                 lawyer profile/credentials/availability, dashboard, cases, hearings, files, invoices, earnings, reports
  routes_common.js                 chat
  routes_admin.js, admin/index.html
  lib/                             core (config, views, slots, ledger, jobs), bot (assistant), digilocker, sms, live (SSE), store/mongostore, sampledata
  test/api.test.js                 16 end-to-end tests
render.yaml                        Render blueprint
```

## Decisions made (from your answers)

One APK with a role picker after OTP (a phone number is locked to one role) · Android + web/PWA · mock payments · rule-based assistant · English with Tamil structure · Chennai first · lawyers hidden until admin-approved · 10% commission (editable in admin) · Render hosting · credentials copied from LifeLink's `.env` except `MONGO_URI`.

## Verified

- 16 backend tests pass: OTP and role lock, DigiLocker mock round trip and the one-identity-per-account rule, lawyer approval, ID review, booking races (two clients, one slot), declined and successful payment, refund on cancel, completion crediting the lawyer, payouts, case request, accept, hearings, stale-edit conflict, private vs shared documents, invoices, reviews, chat limits, urgent request to nearby online lawyers, live stream, admin settings and sample data, account export, logout-all and erasure.
- In the browser: client sign-in, DigiLocker mock redirect and return, home, list and live map, lawyer profile, booking, payment decline and success, case with invoice, assistant, chat; lawyer dashboard receiving a request live.
- In the APK on an Android 12 emulator: app starts, signs in, and **a hard process kill reopens on the same screen**.
- **Not verified:** real SMS (Twilio), real Setu DigiLocker end to end, push, a physical phone, release signing, iOS.

## Going live

| # | Need | Where |
|---|---|---|
| 1 | Render account and **MongoDB Atlas** URI | `MONGO_URI`, `PUBLIC_BASE_URL` in Render |
| 2 | Production admin password | `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| 3 | Twilio Verify live (India needs DLT registration); `SMS_PROVIDER=twilio_verify`, **remove `DEV_OTP`**, `NODE_ENV=production` | env |
| 4 | Setu production (KYC), `DL_PROVIDER=setu`; the return URL must be your https domain | env |
| 5 | Firebase project: `app/google-services.json` and a service-account key | push |
| 6 | Razorpay: replace the demo gateway in `routes_client.js` (`/api/payments/:id/pay`) with order + signature verification | payments |
| 7 | Map tile provider (OSM's free servers are not for production traffic) | `js/client.js`, `js/lawyer.js` |
| 8 | Release keystore and Play Console; build with `-PapiBase=https://<your service>.onrender.com` | Android |
| 9 | Native Tamil speaker to review `TA` in `js/core.js` (currently covers navigation, headings and key buttons only; the rest falls back to English) | i18n |

The local `server/.env` uses `DL_PROVIDER=mock` and `DEV_OTP=1` so everything works offline. LifeLink's Setu and Twilio values are in it; the Render blueprint sets `DL_PROVIDER=setu` and `twilio_verify`.

## Risks to settle before launch (not code)

1. **Bar Council of India advertising rules.** Advocates are restricted from soliciting work, and platforms that list and rank lawyers have drawn regulatory attention. Get a lawyer's opinion on how listings, ratings, "from ₹X" fees and the urgent-alert feature should be framed.
2. **Bar Council verification is manual.** DigiLocker verifies identity (Aadhaar), not enrolment. The admin approval screen shows the certificate next to the Aadhaar name; checking the enrolment number with the State Bar Council is still a human step.
3. **Aadhaar and DPDP Act.** The app keeps only the last 4 digits and never an Aadhaar copy. Privacy policy and terms are drafts and need counsel review.
4. **Payments.** Currently a demo gateway; no money moves. Commission, GST on the platform fee and TDS on lawyer payouts need an accountant before real payments.
5. **Scale.** One API process per database (live hub and working set in memory). Fine for a pilot; use Redis pub/sub and direct Mongo reads to scale beyond one process. Case documents are stored as base64 in the database (1.5 MB cap); move to object storage before heavy use.
6. **Assistant content.** Rule-based answers (arrest rights, cheque bounce, consumer, cyber) are general and should be reviewed by a lawyer.

## Ideas not built (v2)

e-sign for engagement letters · eCourts case-status auto-sync · lawyer-to-lawyer referrals · legal-aid / pro-bono listings · in-app voice/video (currently Jitsi link and phone) · client ratings of lawyers' responsiveness · subscriptions/featured placement · Hindi.
