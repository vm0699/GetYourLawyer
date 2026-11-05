# GetYourLawyer

Find verified lawyers on a live map, book consultations, register and follow cases, chat, and pay. One Android app (and web/PWA) with two roles chosen after OTP: **Client** and **Lawyer**. Black-and-white theme. English, with Tamil in place.

Built on the same stack as LifeLink: plain `index.html` + `css/` + `js/` (no build step) in a Kotlin WebView, a zero-framework Node backend, MongoDB, Twilio Verify OTP, DigiLocker through Setu, Leaflet maps, server-sent events for live updates.

## Features

**Client:** OTP login · DigiLocker or ID-upload verification · home with practice areas · lawyer search with filters · **live map** (online lawyers pulse; moves in real time) · lawyer profile (fees, reviews, credentials, directions) · booking by chat / call / video / in person with real slot availability (no double booking) · demo payment · reschedule / cancel with refund rules · register a case with a lawyer (or alert nearby lawyers for urgent help) · case tracker: stage, hearings, documents, updates, invoices · live chat · notifications · saved lawyers · receipts · rule-based assistant · Tamil/English · White/Black appearance · data export and account deletion.

**Lawyer:** onboarding wizard (DigiLocker identity, Bar Council number + certificate, profile, chamber pin on a map) with admin approval · dashboard with KPIs, today's appointments, upcoming hearings · online toggle and optional live location · requests inbox (accept/decline, first-come for urgent) · cases: add by client phone, edit stage, schedule hearings (client reminded the day before), post updates, private notes, documents, invoices · calendar · fees per mode and weekly availability · earnings, bank/UPI, payouts · reports with charts and CSV export · reviews with replies.

**Admin (`/admin`):** dashboard, lawyer approval queue with certificate viewer, ID reviews, users (suspend), bookings, cases, payments (refund), payouts, reviews moderation, support tickets, broadcast, settings (commission, verification rules, radius, maintenance), audit log, CSV exports, sample-data loader.

**Kill and reopen:** the current tab and screen stack are saved on every navigation and restored on launch, together with the 60-day session. Verified in the APK by force-stopping the process.

## Run it

```bash
cd server
cp .env.example .env     # DEV_OTP=1 shows the OTP on screen; DL_PROVIDER=mock uses the built-in DigiLocker stand-in
node server.js           # http://localhost:8790  (web app)   http://localhost:8790/admin
node seed.js             # optional: 17 fictional Chennai lawyers (also a button in admin)
npm test                 # 16 end-to-end API tests
```

Android (JDK 17+, Android SDK 35):

```bash
./gradlew assembleDebug -PapiBase=http://10.0.2.2:8790          # emulator talking to your machine
./gradlew assembleDebug -PapiBase=http://192.168.1.5:8790       # phone on your Wi-Fi
./gradlew assembleRelease -PapiBase=https://getyourlawyer-api.onrender.com
```

Edit only the root `index.html`, `css/`, `js/`; Gradle copies them into the app. See [docs/HANDOFF.md](docs/HANDOFF.md) for status, go-live checklist and risks.
