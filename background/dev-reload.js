/*
 * Dev-only hot reload. Connects to the local reload server (`npm run dev`) and
 * calls chrome.runtime.reload() when a watched file changes, so you don't have
 * to click "reload" in chrome://extensions after every edit.
 *
 * Only active for an unpacked ("development") install, and EXCLUDED from the
 * packaged Web Store zip (dev/package.sh). The service worker imports it with a
 * swallowed catch, so in a packed install the missing file is a harmless no-op.
 */
const DEV_RELOAD_URL = "ws://localhost:8765";
const RECONNECT_DELAY_MS = 2000;
// A short burst of quick retries covers the common in-session case: the dev
// server restarting under you. It is deliberately NOT unbounded — an endless
// 2s loop floods the console with Chrome's WebSocket errors and, worse, keeps
// the MV3 service worker permanently alive, masking the very SW-teardown
// behavior you want to observe while developing.
const FAST_ATTEMPTS = 5;
// ...but a burst alone is a one-shot budget, and that was the bug (bd
// workspace-custom-palette-age). Load the extension BEFORE starting `npm run
// dev` - the normal order - and the burst expires in ~10s, the worker then
// idles out, and nothing ever runs this file again. Hot reload was dead for the
// rest of the session even once the server came up, silently: the server log
// simply never printed "[dev] extension connected", which is exactly what was
// observed during the 0.1.7 work.
//
// The alarm fixes that by WAKING the worker on a schedule. Note it does not
// need to catch its own event: connect() runs at module scope on every service
// worker startup, so being woken IS the retry. That matters because this module
// is imported dynamically, so a listener here can miss the dispatch that woke
// the worker in the first place.
//
// "alarms" is already in the manifest for the config refresh, so this adds no
// permission; the service worker's own onAlarm handler filters by name and
// ignores this one.
const RETRY_ALARM = "dev-reload-retry";
// Chrome clamps periodInMinutes to its own floor (30s); the exact cadence does
// not matter, only that it recurs.
const RETRY_PERIOD_MINUTES = 0.5;

let attempts = 0;
// True once the alarm is arming our retries, i.e. we have already established
// that no server is answering. It gates the burst: without it, every alarm wake
// re-ran the full 5-attempt burst from scratch (module state resets when the
// worker respawns), so an unpacked install with no dev server running - the
// common case, and the one the mandated pre-release smoke check uses - got
// hundreds of failed-WebSocket errors an hour and a worker that never settled
// into a long idle. That is precisely what the comment above says this design
// avoids, so the burst must happen once, not once per wake.
let parked = false;

function scheduleReconnect() {
  if (!parked && attempts < FAST_ATTEMPTS) {
    attempts += 1;
    setTimeout(connect, RECONNECT_DELAY_MS);
    return;
  }
  // Burst spent (or already parked): one quiet attempt per wake, and let the
  // worker sleep in between.
  if (!parked) {
    parked = true;
    console.log(
      `[brand-palette dev] reload server not reachable; retrying quietly about every ${RETRY_PERIOD_MINUTES * 60}s. Start "npm run dev" and it will reconnect on its own.`,
    );
  }
  chrome.alarms?.create(RETRY_ALARM, { periodInMinutes: RETRY_PERIOD_MINUTES });
}

function connect() {
  let ws;
  try {
    ws = new WebSocket(DEV_RELOAD_URL);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.addEventListener("open", () => {
    attempts = 0; // connected: restore a fresh retry budget if it later drops
    parked = false;
    // Stop waking the worker on a timer; the live socket is the signal now.
    chrome.alarms?.clear(RETRY_ALARM);
    console.log("[brand-palette dev] reload channel open");
  });
  ws.addEventListener("message", (e) => {
    if (e.data === "reload") {
      console.log("[brand-palette dev] reloading extension");
      chrome.runtime.reload();
    }
  });
  ws.addEventListener("close", scheduleReconnect);
  ws.addEventListener("error", () => { try { ws.close(); } catch { /* ignore */ } });
}

// getSelf() needs no permission; only connect for unpacked dev installs.
chrome.management?.getSelf?.().then(async (info) => {
  if (info.installType !== "development") return;
  // Module state does not survive a worker respawn, and every alarm wake IS a
  // respawn - so `parked` has to be recovered from something that persists.
  // The alarm is exactly that: its existence means an earlier run already
  // established that nothing is listening, so this wake gets ONE quiet attempt
  // rather than another burst.
  parked = !!(await chrome.alarms?.get(RETRY_ALARM));
  connect();
}).catch(() => {});
