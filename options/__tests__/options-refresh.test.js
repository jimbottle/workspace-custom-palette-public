/**
 * The refresh control beside the palette selector (workspace-custom-palette-46x).
 *
 * The options page reads the palette collection once at mount and does not
 * subscribe to storage for it, so these tests change storage BEHIND the page
 * (as the popup, a second tab or another device would) and assert that the
 * button, and only the button, brings the page back in line.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeChrome } from "../../shared/__tests__/harness/fake-chrome.js";
import { mountPage, waitFor } from "../../shared/__tests__/harness/mount.js";

const ALPHA = [{ name: "Alpha One", hex: "#111111", order: 0 }];
const BETA = [{ name: "Beta One", hex: "#ABCDEF", order: 0 }];

/** Two personal palettes, Beta active, opted in - the ordinary switcher state. */
function twoPalettes() {
  return createFakeChrome({
    managed: { mode: "absent" },
    sync: {
      "pal:a": { name: "Alpha", swatches: ALPHA },
      "pal:b": { name: "Beta", swatches: BETA },
      paletteOrder: ["a", "b"], activePaletteId: "b", multiPalette: true,
    },
  });
}

/** @param {ReturnType<typeof createFakeChrome>} fake */
async function mountOptions(fake) {
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "editor rows" });
  return page;
}

/** @param {ReturnType<typeof mountPage> extends Promise<infer P> ? P : never} page */
const optionLabels = (page) =>
  [...page.doc.querySelectorAll("#active-palette option")].map((o) => o.textContent);

test("options: refresh re-reads names, colors and a new entry written behind the page", async () => {
  const fake = twoPalettes();
  const page = await mountOptions(fake);
  try {
    assert.deepEqual(page.shownHexes(), ["#ABCDEF"]);
    const btn = page.byId("refresh-palettes");
    assert.equal(btn.hidden, false);
    assert.ok(btn.querySelector("svg"), "the glyph is built into the button");

    // The popup renames Beta, recolours it, and creates a third palette.
    await fake.sync.set({
      "pal:b": { name: "Beta renamed", swatches: [{ name: "Beta Two", hex: "#222222", order: 0 }] },
      "pal:c": { name: "Gamma", swatches: [{ name: "G", hex: "#333333", order: 0 }] },
      paletteOrder: ["a", "b", "c"],
    });
    // Nothing on the page moved by itself: no listener, by design.
    assert.deepEqual(optionLabels(page), ["Alpha", "Beta"]);
    assert.deepEqual(page.shownHexes(), ["#ABCDEF"]);

    page.click(btn);
    await waitFor(() => /refreshed/i.test(page.status()), { label: "refresh status" });
    assert.deepEqual(optionLabels(page), ["Alpha", "Beta renamed", "Gamma"]);
    assert.equal(/** @type {HTMLSelectElement} */ (page.byId("active-palette")).value, "b");
    assert.deepEqual(page.shownHexes(), ["#222222"], "the editor shows the saved colors");
  } finally {
    page.unmount();
  }
});

test("options: refresh follows a pointer moved elsewhere", async () => {
  const fake = twoPalettes();
  const page = await mountOptions(fake);
  try {
    await fake.sync.set({ activePaletteId: "a" });
    page.click(page.byId("refresh-palettes"));
    await waitFor(() => /refreshed/i.test(page.status()), { label: "refresh status" });
    assert.equal(/** @type {HTMLSelectElement} */ (page.byId("active-palette")).value, "a");
    assert.deepEqual(page.shownHexes(), ["#111111"]);
    assert.equal(page.byId("delete-palette").hidden, false, "own active palette: still deletable");
  } finally {
    page.unmount();
  }
});

test("options: refresh with unsaved edits arms first, then discards on the second click", async () => {
  const fake = twoPalettes();
  const page = await mountOptions(fake);
  try {
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#999999");
    assert.deepEqual(page.shownHexes(), ["#999999"]);
    await fake.sync.set({
      "pal:b": { name: "Beta", swatches: [{ name: "Beta One", hex: "#444444", order: 0 }] },
    });

    const btn = page.byId("refresh-palettes");
    page.click(btn);
    assert.match(page.status(), /unsaved changes/i, "first click only warns");
    assert.deepEqual(page.shownHexes(), ["#999999"], "the edit is still there");
    assert.equal(btn.dataset.armed, "1");

    page.click(btn);
    await waitFor(() => /refreshed/i.test(page.status()), { label: "refresh status" });
    assert.deepEqual(page.shownHexes(), ["#444444"], "second click loads what is stored");
    assert.equal(btn.dataset.armed, undefined, "disarmed after the refresh");
  } finally {
    page.unmount();
  }
});

test("options: refresh with a clean editor does not ask", async () => {
  const fake = twoPalettes();
  const page = await mountOptions(fake);
  try {
    const btn = page.byId("refresh-palettes");
    page.click(btn);
    await waitFor(() => page.status() !== "", { label: "status" });
    assert.match(page.status(), /refreshed/i);
    assert.equal(btn.dataset.armed, undefined);
  } finally {
    page.unmount();
  }
});

test("options: with ONE palette the chooser hides but refresh stays and works", async () => {
  // The common case, and the one the first cut missed (roborev 4634): a
  // single stored palette goes stale exactly as several do, but the chooser
  // only renders with two or more entries, so a refresh nested inside it was
  // unreachable for most users.
  const fake = createFakeChrome({
    managed: { mode: "absent" },
    sync: { "pal:a": { name: "Alpha", swatches: ALPHA }, paletteOrder: ["a"], activePaletteId: "a" },
  });
  const page = await mountOptions(fake);
  try {
    assert.equal(page.byId("switcher").hidden, true, "one palette: no chooser");
    assert.equal(page.byId("switcher-note").hidden, true, "and no chooser note");
    const btn = page.byId("refresh-palettes");
    assert.equal(btn.hidden, false, "but refresh is offered");
    assert.equal(btn.closest("#switcher"), null, "because it is not inside the chooser");
    assert.deepEqual(page.shownHexes(), ["#111111"]);

    await fake.sync.set({ "pal:a": { name: "Alpha", swatches: [{ name: "Alpha Two", hex: "#5A5A5A", order: 0 }] } });
    page.click(btn);
    await waitFor(() => /refreshed/i.test(page.status()), { label: "refresh status" });
    assert.deepEqual(page.shownHexes(), ["#5A5A5A"]);
    assert.equal(page.byId("switcher").hidden, true, "still one palette, still no chooser");
  } finally {
    page.unmount();
  }
});
