/**
 * Popup behaviour around a SLOW enterprise-policy read.
 *
 * Split out from popup-glue.test.js because these cases have to run against
 * the real deadlines in popup.js and lib/storage.js (a 1500ms render deadline,
 * a 3000ms save deadline) and are therefore seconds long. node runs test files
 * in parallel, so keeping them here costs wall clock only once.
 *
 * The distinction under test is the one every one of these bugs collapsed:
 * "the answer has not arrived yet" is NOT "there is no policy". Guessing the
 * latter writes a personal override on top of an org palette that simply had
 * not loaded, which permanently detaches that user from admin updates and
 * syncs the detachment to every machine they own.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeChrome } from "../../shared/__tests__/harness/fake-chrome.js";
import { mountPage, waitFor } from "../../shared/__tests__/harness/mount.js";

const ORG = [
  { name: "Org Blue", hex: "#1A73E8" },
  { name: "Org Green", hex: "#34A853" },
];

// Must stay above MANAGED_READ_TIMEOUT_MS (1500) in lib/storage.js, so the
// popup genuinely renders before the answer exists.
const LATE_MS = 1800;

test("popup: a policy that arrives after the render deadline still reaches the screen", async () => {
  // The popup used to reveal "Your organization provides these colors" over the
  // PACKAGED DEFAULTS it had rendered while the read was outstanding. Because
  // this editor auto-saves, a user who tweaked one row on the strength of that
  // note wrote an override derived from the defaults and detached from a policy
  // they were never actually shown.
  const fake = createFakeChrome({ managed: { mode: "late", value: ORG, delayMs: LATE_MS } });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "first render" });
    // Rendered from the packaged defaults: the policy has not answered yet.
    assert.equal(page.rows().length, 7, "seeded from the packaged defaults");
    assert.equal(page.byId("managed-note").hidden, true, "no org note before the answer");

    await waitFor(() => page.rows().length === 2, { timeoutMs: 4000, label: "late policy re-seed" });
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    assert.equal(page.byId("managed-note").hidden, false, "org note appears with the policy");
    // Re-seeding is a screen update, never a write: setPalette does not emit,
    // so nothing was persisted on this user's behalf.
    assert.equal("palette" in fake.sync.snapshot(), false);
  } finally {
    page.unmount();
  }
});

test("popup: a policy read that never settles refuses the save instead of guessing", async () => {
  // The refusal is the whole point: a dropped edit is recoverable and is
  // reported in the status line, whereas a wrongly-written override is
  // permanent and syncs everywhere.
  const fake = createFakeChrome({ managed: { mode: "never" } });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "first render" });
    assert.equal(page.rows().length, 7, "rendered the packaged defaults on the deadline");

    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");

    // The edit commits at once, then waits 3000ms for an answer that never comes.
    await waitFor(() => /Save failed/.test(page.status()), {
      timeoutMs: 6000,
      label: "the bounded refusal",
    });
    assert.match(page.status(), /haven't loaded yet/, "the user is told why nothing was saved");
    assert.equal(
      "palette" in fake.sync.snapshot(), false,
      "an unknown policy must never be written down as 'unmanaged'",
    );
  } finally {
    page.unmount();
  }
});
