# OnQ API Feature Requests (Even Hub SDK, Simulator & Workspace Auth)

Five concrete, engineering-grade API gaps encountered while building and verifying OnQ for Even Realities G2:

## 1. Even Hub SDK (`0.0.16`): Normalize Proto3 Zero-Value Enum Defaults in Bridge
- **Observed Behavior:** Plain temple taps arrive on `sysEvent` with `eventType: undefined` because protobuf3 omits enum value `0` (`CLICK_EVENT`) on the wire. Similarly, selecting row `0` in a `ListContainer` omits `currentSelectItemIndex`.
- **Impact:** Every EvenHub app must implement defensive dual-channel normalization (`normalizeEvenEvent`) or taps and first-row selections silently fail.
- **Requested API:** Normalize omitted `eventType` to `OsEventTypeList.CLICK_EVENT` (`0`) and omitted `currentSelectItemIndex` to `0` inside `evenHubEventFromJson()` before emitting to `onEvenHubEvent` listeners.

## 2. Even Hub SDK: Permissioned 1-Line Ambient Heads-Up Slot (Background Complication)
- **Observed Behavior:** G2 runs one foreground WebView app at a time, and iOS suspends WebView polling on `FOREGROUND_EXIT_EVENT`.
- **Impact:** Time-critical corridor collisions (e.g., `"14:00 Investor call in 5m - Investor asked to push 15m"`) cannot alert the wearer unless OnQ is already open in the foreground.
- **Requested API:** A user-permissioned, rate-limited 1-line ambient status push slot (`pushAmbientBanner({ text, ttlSec })`) managed by the companion host.

## 3. Even Hub SDK: Text Measurement & Overflow Feedback on `textContainerUpgrade`
- **Observed Behavior:** `textContainerUpgrade` returns `Promise<boolean>` with no layout metrics. Exceeding LVGL's width/height or 999-byte limits silently clips or adds scrollbars depending on container sizing.
- **Impact:** Teams must maintain external Chromium geometry gates (`verify-geometry.mjs`) to verify zero clipping.
- **Requested API:** Return `{ ok: boolean, truncated: boolean, renderedLines: number, utf8Bytes: number }` from `textContainerUpgrade` and `createStartUpPageContainer`, or expose an LVGL font width table in the SDK.

## 4. Even Hub Simulator (`0.9.5`): Documented Audio Injection & Video Capture Automation Endpoints
- **Observed Behavior:** `--automation-port` exposes `/api/screenshot/glasses`, `/api/console`, and `/api/input` (up/down/click/double_click/long_press/long_press_release), which made visual QA reproducible. However, there is no endpoint to inject a 16 kHz PCM16 WAV fixture into `audioEvent`.
- **Impact:** Automated CI voice tests cannot exercise the full `long_press -> audioEvent -> RMS gate -> STT` loop inside the simulator binary without virtual loopback audio devices.
- **Requested API:** Add `POST /api/audio` (accepting 16 kHz mono PCM16 WAV bytes streamed as 100 ms `audioEvent` chunks) to the `--automation-port` server.

## 5. Even Hub WebView / Companion Host: Scoped PKCE System-Browser OAuth Handoff
- **Observed Behavior:** Google blocks OAuth2 login screens inside embedded WebViews (`disallowed_useragent`).
- **Impact:** Every Google Workspace app must host an external phone pairing page with short-lived pairing codes and a local token vault.
- **Requested API:** Provide `bridge.startOAuthPkce({ authUrl, callbackScheme })` in `@evenrealities/even_hub_sdk` to open the system browser/ASWebAuthenticationSession and return the authorization code cleanly to the WebView without storing client secrets inside `.ehpk`.
