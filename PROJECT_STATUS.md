# RideSafe project status and working notes

**Last updated:** 2026-11-09  
**Project:** RideSafe — Smart Two-Wheeler Accident Detection & Emergency Alert System  
**Status:** Early working prototype with a refreshed UI based on `documnets/Rydex_UI.png`. Contact selection, a foreground countdown, and the Firebase/Twilio integration scaffold exist. The app is not connected to the physical device and automatic SMS has not been verified against a deployed service or a phone.

Use this document as the project’s ongoing status record. Update the date, tracker, validation results, and known limitations whenever implementation changes. The requirements source documents in `documnets/` are user-provided; leave them unchanged.

## 1. What the application currently does

### Sign-in and demo access

- Shows an email/password sign-in and account-creation screen when the required Firebase client settings are present in a local `.env`.
- Offers a local demo entry point. Demo mode does not authenticate and does not send SMS automatically.
- Uses a dark, high-contrast visual style with blue/purple login actions, cyan safety indicators, card-based dashboard, contact list selection states, and a prominent orange SOS countdown treatment inspired by the screenshot in `documnets/Rydex_UI.png`.
- Firebase Authentication uses persisted auth state on mobile through AsyncStorage and browser persistence on web.
- Firebase configuration is currently absent from the repository; `.env.example` contains placeholders only.

### Emergency contacts

- Opens the phone’s native contact picker; the user selects an existing contact and a saved phone number rather than typing a name and number into RideSafe.
- Requests contact permission only when the picker is used. It does not need write access to the address book.
- Stores the selected name, phone number, local contact identifier, and selection state on the device using AsyncStorage.
- Supports including/excluding a saved contact and removing it from RideSafe.
- Allows up to five recipients in one alert. Automatic sending requires every recipient number to be in E.164 format (for example, `+14155550123`).
- Contact details are local app data; recipients and location are sent to the configured backend when an authenticated automatic alert is submitted.

### Alert test and message workflow

1. The dashboard’s **Start alert test** action checks for at least one selected contact and no more than five recipients.
2. Before starting the timer, RideSafe shows a confirmation. It explains whether the confirmed action is a real automatic-SMS attempt or an SMS draft and warns about possible charges in the automatic case.
3. A 30-second countdown appears. Cancellation is disabled for its first five seconds, then becomes available until the timer expires.
4. If cancelled in time, no SMS workflow is started. On expiry, the app obtains a foreground phone location where possible and starts the configured sending path once for that countdown.
5. In authenticated, configured mode, the app calls the Firebase callable function. In local demo mode or without the configured authenticated path, it opens a prefilled message in the device SMS composer when available.

The SMS composer is **not** automatic sending: the user must review and tap **Send**. A successful Twilio API response means that the provider accepted a request; it does not prove that the recipient received the SMS.

### Location and message content

- Requests foreground location permission when preparing an alert.
- Includes a Google Maps URL and recorded time when a location is available. If location is not available, the message states that it is unavailable.
- The backend composes the emergency message and validates coordinates and timestamp before accepting them.
- Location is not continuously tracked, and background location is not configured.

### Current screens

- Login / create account / local demo
- Dashboard
- Emergency contacts
- Accident warning and countdown

Navigation is currently a small screen-state implementation in `App.js`, not a full navigation framework. The dashboard explicitly indicates that hardware has not been configured.

## 2. What is not implemented or not verified

- **ESP32 BLE:** No BLE package, scan/connect flow, service discovery, notification subscription, command writes, disconnect/reconnect handling, or incoming sensor-message parser is implemented.
- **Hardware-triggered accident alert:** The countdown is started from the app’s test UI, not from an ESP32 `F` event.
- **Ride lifecycle and safety checks:** There is no Start Ride / End Ride workflow, pre-ride readiness gate, live riding dashboard, calibration, or sensor reset.
- **Background operation:** The timer is JavaScript foreground UI state. It is not guaranteed to continue if the app is backgrounded, suspended, killed, or the phone is locked. No Android foreground service, companion-device integration, native BLE task, or locked-phone test exists.
- **Warning behavior:** No guaranteed notification, alarm, or vibration implementation is present for incoming hardware events.
- **Automatic sending:** The client and Cloud Function are scaffolds only. No Firebase project, Firestore database, deployed function, Twilio account/secrets, or real delivery test is configured.
- **Delivery guarantees:** Neither Twilio acceptance nor a callable function response guarantees carrier delivery or recipient action. No delivery-status callback/webhook is configured.
- **Production hardening:** No end-to-end, device, hardware-in-loop, background, or automated UI test suite has been run. No APK/EAS build has been produced.
- **Full product UI/settings:** No dedicated settings, BLE device, pre-ride, riding, notification preference, or alert history screen exists.

Do not describe any of these as working until implemented and tested on the intended hardware and Android device.

## 3. Architecture and important files

| File or directory | Purpose / current contents |
|---|---|
| `App.js` | Current app screens and state; screenshot-inspired UI, Firebase sign-in, contact picker and persistence, location retrieval, timer, confirmation, SMS composer fallback, callable-function invocation. |
| `index.js` | Expo/React Native application entry point. |
| `app.json` | Expo app metadata and Contacts/Location plugins and permission text; Android blocks `WRITE_CONTACTS`. |
| `src/services/firebase.js` | Firebase client initialization, Auth persistence, Functions region, and typed callable alert client. |
| `functions/src/index.js` | Firebase callable `sendEmergencyAlert`; authentication check, request validation, Twilio SMS submission, event/idempotency record, and rate limit. |
| `functions/package.json` | Cloud Functions dependencies and Node 22 runtime target. |
| `firebase.json` | Firebase Functions and Firestore deployment configuration. |
| `firestore.rules` | Denies all client reads and writes by default. Admin SDK Cloud Function access is separate from client rules. |
| `firestore.indexes.json` | Firestore index configuration (currently no custom indexes are required). |
| `.env.example` | Names/placeholders for public Firebase web-app configuration and Functions region. It is not a real project configuration. |
| `.gitignore` | Ignores local `.env`, Firebase project selection, generated native folders and dependency/build artifacts. |
| `SETUP.md` | Step-by-step Firebase, Twilio, deployment, and basic alert test setup. |
| `documnets/Rydex_UI.png` | User-provided visual reference for the login, dashboard, contact, and SOS alert screens. |
| `documnets/` | User-provided source briefs and design-thinking report. The directory spelling is existing project content. |

### Technology currently in use

- Expo SDK 58 (`expo` package currently `~58.0.22`), React Native 0.88, React 19, JavaScript.
- Expo Contacts, Location, SMS, and Status Bar packages.
- Expo LinearGradient (`~58.0.3`) for the current branded buttons and safety cards.
- AsyncStorage for local contact and Firebase Auth persistence.
- Firebase JavaScript SDK for Email/Password Auth and callable Functions.
- Firebase Admin SDK / Cloud Functions v2 callable API and Twilio in the separate backend.
- No BLE or React Navigation dependency is currently declared.
- No checked-in `android/` or `ios/` native project. Expo generates native projects as needed; configure native behavior through Expo config/plugins rather than hand-editing generated folders.

## 4. Backend behavior and constraints

The callable function is named `sendEmergencyAlert` and currently:

- Requires a signed-in Firebase user.
- Accepts a unique event ID, 1–5 unique E.164 recipient numbers, and either valid location data or `null`.
- Checks that Twilio secrets are available and that the sender number is E.164 before reserving an alert.
- Creates an event record under the signed-in user and uses a Firestore transaction to prevent duplicate event submission and enforce at most three alert attempts per rolling 24-hour window for that user.
- Sends one Twilio message per recipient, records an accepted/failed status, and returns aggregate counts. Stored results include recipient last-four digits and provider message IDs; full recipient numbers are not intentionally written into the event result.
- Uses Firebase Admin access; client Firestore rules deny all direct client access.
- Uses region `us-central1`, max two function instances, and a 60-second timeout.

This is a prototype safeguard, not a complete abuse-prevention or emergency-dispatch system. Review quota policy and cost controls before a public release. A timeout/retry after provider acceptance can create ambiguity; idempotency helps avoid repeat calls but is not a proof of exactly-once carrier delivery.

## 5. Hardware contract and physical hardware status

### Source-brief hardware target (not confirmed physically)

The source brief `documnets/prompt 3.txt` describes an ESP32-based device using BLE and a GY-521 (MPU6050). Its UUIDs, messages, commands, and thresholds below are a reference contract for that target, not a confirmed working interface for the reported physical board.

| Item | Briefed value |
|---|---|
| BLE device name | `RideSafe-ESP32` |
| Service UUID | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` |
| TX / notify / read UUID | `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` |
| RX / write UUID | `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` |
| Device messages | `U` calibration required; `N,angle` normal; `S,angle` suspicious; `C,angle,seconds` confirming; `F,angle` possible accident; `E` sensor error |
| Commands | `CAL` calibrate upright; `RESET` reset fall detection |
| Firmware thresholds (do not change without user approval) | 1.7 g acceleration; 140 degrees/second rotation; 65-degree fall tilt; 5-second confirmation; 4-second movement-to-tilt window; 45-degree recovery angle |

### Physical hardware reported in prompt4

- Board family: ESP8266; exact board model is not yet identified.
- Sensor: GY-521 / MPU6050 reported available.
- The ESP8266 does not include native BLE. Its communication method is not selected or verified.
- Hardware integration is blocked until the board is identified and the communication method is chosen.
- Do not assume the ESP32 BLE UUIDs work with the reported board. If using the ESP8266, assess Wi-Fi or external BLE hardware; if switching to ESP32, confirm the board and firmware first.
- Do not change firmware detection thresholds without explicit user approval.

## 6. Progress tracker

Use these evidence statuses consistently: **Implemented in source** means code exists, but may not have been tested; **Locally verified** means the stated local check passed; **Device verified** means tested on a physical Android device; **Service verified** means tested against deployed Firebase/Twilio; **Hardware verified** means tested with the actual board and sensor; **Not started** means no implementation exists.

### Implemented in source

- [x] Expo app baseline and screenshot-inspired dark login, dashboard, contact, and SOS countdown screens.
- [x] Native phone contact picker and local add/select/remove/persistence flow.
- [x] Contact and selected-recipient checks, including the five-recipient cap.
- [x] 30-second foreground countdown, five-second cancellation lockout, and one-shot expiry handling.
- [x] Explicit consent prompt before starting a test that can attempt a real SMS.
- [x] Foreground location retrieval and message location text when available.
- [x] SMS composer fallback with explicit UI wording that the person must tap Send.
- [x] Firebase Email/Password client flow and callable Functions client scaffold.
- [x] Firebase callable/Twilio backend scaffold with validation, secrets, idempotency records, and a per-user attempt limit.
- [x] Firebase Firestore client-deny rules and local secret/config ignore patterns.
- [x] Setup guide and public Firebase config template.

### Implemented in source; awaiting device/service verification

- [ ] Configure Firebase project, Authentication, Firestore, and local `.env`.
- [ ] Configure Twilio account, sender number, and Firebase secret values.
- [ ] Deploy function and Firestore rules; confirm correct project and region.
- [ ] Test signup/sign-in persistence and backend callable invocation on an Android development build.
- [ ] Confirm Twilio acceptance and independently verify receipt with consenting test recipients.
- [ ] Test contact picker, permission denial, location denial, SMS fallback and cancellation on a real device.

### Locally verified

- [x] ESLint and JavaScript type-check passed after the screenshot-inspired redesign.
- [x] Android JavaScript bundle export passed after the screenshot-inspired redesign.
- [ ] Resolve the Expo SDK patch mismatch (`58.0.22` versus expected `~58.0.23`) and rerun Expo Doctor.

### Device, service, and hardware verified

- None recorded yet. Physical Android, deployed Firebase/Twilio, and actual board/sensor verification are still outstanding.

### Not started — core application work

- [ ] Identify the physical board and choose ESP8266 Wi-Fi / external BLE or a confirmed ESP32 BLE design before implementing device communication.
- [ ] Integrate a communication library compatible with Expo SDK 58 / current React Native architecture after the hardware path is confirmed; check its current native requirements and Android permissions.
- [ ] Configure development build/EAS and required Android permissions through supported Expo configuration/plugin mechanisms.
- [ ] Scan for `RideSafe-ESP32`, connect/disconnect, discover the documented service/characteristics, subscribe to TX notifications, and write `CAL` / `RESET` to RX.
- [ ] Parse and validate `U`, `N,angle`, `S,angle`, `C,angle,seconds`, `F,angle`, and `E` messages; handle malformed data and duplicate events.
- [ ] Connect a genuine `F` device event to the same cancellable alert workflow without allowing repeated notifications to restart the countdown.
- [ ] On cancellation, send/reset the hardware state according to the agreed device protocol; test the behavior with the actual firmware.
- [ ] Add device connection/sensor/location/contact/notification readiness checks; never show readiness for unsupported telemetry.
- [ ] Implement ride start/end state, live tilt and BLE status, elapsed time, connection loss/reconnect, calibration, and sensor-error UX.
- [ ] Decide and implement supported background BLE/locked-phone behavior, including the required native foreground-service or companion-device approach if needed; document Android restrictions.
- [ ] Add local warning notification/vibration behavior and verify permission/error cases.
- [ ] Add automated tests for message parsing, countdown/cancel/duplicate handling, contact validation, location fallbacks, and backend validation/idempotency.
- [ ] Run end-to-end hardware and delivery tests; generate and install a development APK; add release build/signing instructions when ready.
- [ ] Review privacy disclosures, consent, billing/rate limits, Twilio compliance, abuse prevention, emergency-use disclaimer, and failure/retry UX before production.

## 7. Validation record

Development environment and most recent recorded checks:

| Check | Result | What it establishes / does not establish |
|---|---|---|
| Windows 11 | Reported confirmed in prompt4 | Development OS; not an app test. |
| `node -v` | `v24.20.0` (2026-11-09) | Node.js installed. |
| `npm -v` | `11.19.0` (2026-11-09) | npm installed. |
| Visual Studio Code | Reported confirmed in prompt4 | Editor availability; not an app test. |
| Android Studio / SDK | Not confirmed | Keep pending until installation is confirmed. |
| `npx expo-doctor` | 19/20 passed (2026-11-09); Expo patch mismatch | `expo` is `58.0.22`; SDK expects `~58.0.23`. Remaining checks passed. |
| `npx eslint .` | Passed after UI update | Static lint only; no runtime/device guarantee. |
| `npx tsc --noEmit --allowJs --checkJs --jsx react-native --target es2022 --moduleResolution bundler --module esnext --customConditions react-native --skipLibCheck App.js src/services/firebase.js` | Passed | Type-checks the two JavaScript app files with the explicit CLI options; this repository does not currently have a project `tsconfig.json`. |
| `node --check functions/src/index.js` | Passed | Function file parses; does not emulate Firebase, Firestore, or Twilio. |
| `npx expo config --type public` | Passed | Expo config resolves; does not build/install native BLE functionality. |
| `npx expo export --platform android` | Passed after the UI redesign (2026-11-09) | Android JavaScript bundle export is not an APK, native development build, BLE test, or service integration test. |
| `npx expo export --platform web` | Not available | `react-dom` and `react-native-web` are not installed; this task targeted the Android-first app. |
| Real Firebase/Twilio test | Not run | No project credentials/secrets or deployed service are available. |
| Android device / ESP32 test | Not run | No physical-device and hardware-in-loop verification is recorded. |

Re-run appropriate checks after changes. Do not copy a previous pass forward as proof that a later change was tested.

## 8. Local development and deployment notes

### App checks

```powershell
npx expo lint
npx tsc --noEmit --allowJs --checkJs --jsx react-native --target es2022 --moduleResolution bundler --module esnext --customConditions react-native --skipLibCheck App.js src/services/firebase.js
npx expo export --platform android
```

`npx expo lint` may depend on the local Expo/ESLint setup; `npx eslint .` is the direct linter command used in the latest recorded validation.

The current Expo Doctor run found one SDK patch mismatch (`expo` `58.0.22`; expected `~58.0.23`). Resolve it with the Expo-compatible version workflow after reviewing the dependency update, then rerun Expo Doctor.

### Start the app

```powershell
npx expo start
```

The contact picker, location, SMS composer, and any future BLE native module must be tested in an appropriate development build/device environment, not treated as verified by a JavaScript bundle export alone.

### Firebase/Twilio

Follow [SETUP.md](./SETUP.md) for the setup sequence. Key points:

- Create `.env` locally from `.env.example`; do not commit it.
- Firebase `EXPO_PUBLIC_*` values are embedded into the client bundle and are not secret credentials.
- Keep Twilio account SID, auth token, and sender number in Firebase server secrets only.
- Firebase Functions deployment requires an appropriately configured Firebase project/billing plan. Twilio trial restrictions and per-message charges may apply.
- Use consenting test recipients and never claim successful dispatch until delivery is independently verified.

## 9. Privacy and data retention

- **Stored on the device:** selected contact names, phone numbers, local contact identifiers, selection state, and Firebase Auth persistence. They remain in app-local AsyncStorage until the app data is cleared or the user removes contacts; no in-app account-data deletion flow is implemented.
- **Sent to the backend when an automatic alert is invoked:** selected recipient phone numbers, alert event ID, and the current location coordinates/timestamp when available. Twilio receives destination number and emergency message content in order to submit SMS.
- **Backend records:** Firestore stores per-user alert status, recipient count, timestamps, masked recipient suffixes, provider status/message IDs, and per-user usage-window counters. Admin SDK access is used by the Cloud Function; direct client Firestore access is denied by the rules.
- **Retention/deletion:** no retention schedule, automatic TTL deletion, or user-facing delete-my-data process has been implemented. Retention and deletion policy are not finalized.
- **Service failures:** if location is unavailable, the alert text indicates this. If the automatic service fails, the app reports the failure and offers a manual SMS composer. If Firebase/network/Twilio are unavailable, automatic delivery does not occur; provider acceptance is not delivery confirmation.

## 10. Product and safety rules to preserve

- Do not add unrestricted Android `SEND_SMS` permission to silently send from the phone; the supported fallback is a prefilled SMS composer.
- Do not put Twilio secrets in the mobile bundle, source code, `.env`, screenshots, or chat.
- Do not claim SMS delivery is guaranteed or that provider acceptance confirms delivery.
- Do not alter the firmware detection thresholds without explicit direction.
- Do not treat ordinary JavaScript timers as background-safe.
- Do not mark the device, sensor, battery, location, or alert service healthy unless that status is actually measured and validated.
- Keep explicit user consent before real alert test messages.
- Clearly show when the app is in demo mode and when the automatic backend is unavailable.

## 11. Decision and change log

| Date | Decision / change |
|---|---|
| 2026-11-09 | ESP32 BLE details in `documnets/prompt 3.txt` are a source-brief reference only. Prompt4 records physical hardware as an ESP8266 of unknown model and GY-521; hardware integration is blocked pending confirmation and communication-method selection. |
| 2026-11-09 | Recorded the current implemented scope, outstanding setup, and unimplemented BLE/background work in this status document. |
| 2026-11-09 | Implemented the UI direction from `documnets/Rydex_UI.png` in login, dashboard, contacts, and SOS countdown screens; Expo LinearGradient added. Validation is pending for this redesign. |
| 2026-11-09 | Windows environment check recorded: Node.js v24.20.0 and npm 11.19.0; Expo Doctor reported 19/20 checks passing, with the Expo patch version mismatch noted above. |

When recording a new entry, include the date, decision or delivered change, affected files/features, validation performed, and any remaining caveat.
