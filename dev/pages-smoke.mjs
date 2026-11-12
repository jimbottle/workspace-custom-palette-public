/**
 * Tier 3, the half a machine can do: drive the extension's OWN pages in a REAL
 * Chromium with the extension actually loaded, and assert what jsdom
 * structurally cannot - real CSS, real chrome.storage, a real service worker.
 * The `[hidden]` failure that shipped three times (an author `display` rule
 * beating the UA's `[hidden]` rule) is invisible to jsdom and caught here.
 *
 * THIS IS NOT THE MANDATORY PRE-RELEASE SMOKE, and must never be reported as
 * one. It never opens Docs, Sheets or Slides: injection into Google's real
 * pickers needs a signed-in account, and that check stays human and stays
 * required before any package (see CLAUDE.md, "Automated testing workflow").
 * Neither does it cover sections C-F of docs/TESTING-0.2.0.md - enterprise
 * policy is delivered by the Admin console to a managed account, which is the
 * production path a release test has to exercise.
 *
 * What it does cover, by that document's step numbers: A2, A3, B1, B2, B2b,
 * B6 (settings half), B6b, B6c, B6e, B6f.
 *
 * Reuses the Playwright + Chromium already installed under monitor/. Run:
 *   npm run smoke:pages
 */
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(ROOT, "monitor/node_modules/playwright"));
// Read, never hardcode: `version` bumps on every upload (CLAUDE.md defaults to
// PATCH), and a literal here would turn the next routine bump into a fake
// regression from the one script whose whole value is being trustworthy.
// Comparing the file on disk against what the browser reports is still a real
// check, not a tautology - the footer renders chrome.runtime.getManifest(), so
// a mismatch means Chrome is running a build that is not this tree, which is
// exactly the stale-build failure step A2 exists to catch.
const MANIFEST_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")).version;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpi-smoke-"));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`);
};

// A persistent context is the only way to load an unpacked MV3 extension, and
// `channel: "chromium"` is the build whose headless mode still runs extensions.
//
// Guarded separately from the try/finally below, because the profile directory
// already exists by now and this is one of the likelier throws in the script:
// headless Chromium failing to start, or the unpacked extension failing to
// load at all. Without this, exactly those failures leak the temp profile -
// the same "the failure path is also the leak path" hole the block below
// closes for everything after it (roborev 4113).
/** @type {import("playwright").BrowserContext} */
let ctx;
try {
  ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: "chromium",
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
  });
} catch (err) {
  fs.rmSync(userDataDir, { recursive: true, force: true });
  throw err;
}

// Everything below runs inside try/finally. The runs most likely to throw are
// the regressions this script exists to catch, so they must not ALSO leak a
// headless Chromium and a temp profile directory - the failure path is the one
// that gets repeated while someone is chasing the failure.
try {
  // The MV3 service worker announces the extension id.
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const id = new URL(sw.url()).host;
  console.log("extension id:", id);

  const page = await ctx.newPage();

  // The copy button overlays the hex field's right padding. Only real CSS can
  // say whether it lands inside the field, clear of the text, without pushing
  // the row wider than the page - jsdom has no layout at all.
  async function checkCopyLayout(target, where) {
    const m = await target.evaluate(() => {
      const hex = document.querySelector("[data-bpi-row] [data-bpi-hex]");
      const copy = document.querySelector("[data-bpi-row] .bpi-copy");
      const row = document.querySelector("[data-bpi-row]");
      if (!hex || !copy || !row) return null;
      const h = hex.getBoundingClientRect();
      const c = copy.getBoundingClientRect();
      const cs = getComputedStyle(hex);
      const ctx2d = document.createElement("canvas").getContext("2d");
      ctx2d.font = cs.font;
      const textRight = h.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
        + ctx2d.measureText("#WWWWWW").width;
      return {
        inside: c.left >= h.left && c.right <= h.right && c.top >= h.top && c.bottom <= h.bottom,
        clearOfText: c.left >= textRight,
        rowFits: row.scrollWidth <= row.clientWidth,
        noPageScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        visible: c.width > 0 && getComputedStyle(copy).visibility !== "hidden",
        detail: `hex ${Math.round(h.left)}-${Math.round(h.right)}, copy ${Math.round(c.left)}-${Math.round(c.right)}, text ends ${Math.round(textRight)}`,
      };
    });
    check(`copy: ${where} renders a visible button inside the hex field`, !!m && m.visible && m.inside, m?.detail);
    check(`copy: ${where} the button clears the widest hex text`, !!m && m.clearOfText, m?.detail);
    check(`copy: ${where} the row does not overflow`, !!m && m.rowFits && m.noPageScroll);
  }

  async function openOptions() {
    await page.goto(`chrome-extension://${id}/options/options.html`);
    await page.waitForSelector("#rows [data-bpi-hex]", { timeout: 10000 });
  }

  // --- A2: the footer version -------------------------------------------------
  await openOptions();
  const footer = (await page.locator("footer, .footer").first().innerText().catch(() => "")) || await page.evaluate(() => document.body.innerText);
  check(`A2 the footer names the manifest's version (${MANIFEST_VERSION})`,
    new RegExp(`Version\\s+${MANIFEST_VERSION.replace(/\./g, "\\.")}`).test(footer),
    footer.split("\n").pop());

  await checkCopyLayout(page, "options");

  // --- A3: no org wording, no selector, no on/off switch, with no policy ------
  // VISIBILITY, not the hidden attribute: this is the bug class that shipped
  // three times because an author `display` rule beat [hidden].
  const visible = async (sel) => await page.locator(sel).first().isVisible().catch(() => false);
  check("A3 no Palette selector with no policy", !(await visible("#switcher")));
  const bodyText = await page.evaluate(() => document.body.innerText);
  // Scoped to the managed NOTE, which is what the A3 bug actually was: it
  // claimed "your organization provides these colors" to everyone, policy or
  // not. A blanket search for the word was the first version and it started
  // failing the moment an unrelated ADMIN control legitimately used it, which
  // is a false alarm rather than a catch - the note is the thing that must stay
  // silent, so that is what this asserts.
  check("A3 the managed note is silent with no policy",
    !(await visible("#managed-note")));
  check("A3 no org CLAIM anywhere with no policy",
    !/organization (provides|sets)/i.test(bodyText),
    bodyText.split("\n").find((l) => /organi[sz]ation/i.test(l)) ?? "(no org wording at all)");
  check("A3 the retired on/off switch is gone", !(await visible("#enabled")) && !/Show brand colors/i.test(bodyText));
  check("A3 [hidden] guard present and effective",
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.textContent = "x"; el.hidden = true; el.style.display = "flex";
      document.body.appendChild(el);
      const hiddenByGuard = getComputedStyle(el).display === "none";
      el.remove();
      return hiddenByGuard;
    }), "an author display rule must not beat [hidden]");

  // --- The brand mark is ADAPTIVE, and matches the toolbar icon ---------------
  {
    const mark = await page.evaluate(() => {
      const rootVal = getComputedStyle(document.documentElement)
        .getPropertyValue("--brandmark-image").trim();
      const el = document.querySelector(".brandmark");
      const favicon = document.querySelector('link[rel="icon"]');
      return {
        rootVal,
        markBg: el ? getComputedStyle(el).backgroundImage : "",
        faviconHref: favicon ? favicon.getAttribute("href") : "",
      };
    });
    const shown = await page.locator("#rows [data-bpi-hex]").evaluateAll(
      (els) => els.map((e) => e.value.toUpperCase()));
    // The mark is built from the palette on screen, so its first stripe must be
    // the first swatch - that is the whole point of it being adaptive.
    check("brandmark: painted from the live palette, not the packaged gradient",
      mark.rootVal.startsWith("linear-gradient") && mark.rootVal.includes(shown[0]),
      `${shown[0]} in ${mark.rootVal.slice(0, 70)}`);
    check("brandmark: the element actually renders that gradient",
      mark.markBg.includes("gradient"), mark.markBg.slice(0, 60));
    check("brandmark: stripes run VERTICALLY, like the toolbar icon",
      /(^|[^-])90deg/.test(mark.rootVal), mark.rootVal.slice(0, 40));
    check("brandmark: the favicon is generated from the same colors",
      (mark.faviconHref || "").startsWith("data:image/svg+xml")
        && decodeURIComponent(mark.faviconHref).includes(shown[0]),
      (mark.faviconHref || "(none)").slice(0, 40));
  }

  // --- The Administrators row lays out on one line ---------------------------
  // A CSS-only defect, so only this tier can see it: the row is a flex line
  // whose trailing description is greedy, and the button shrank to the
  // narrowest column that could hold it - "Build / organization / colors" over
  // four lines (field, 2026-08-26).
  {
    const wrapped = await page.evaluate(() => {
      const b = document.getElementById("policy-builder");
      if (!b) return { missing: true };
      const style = getComputedStyle(b);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      const inner = b.getBoundingClientRect().height
        - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      return { lines: inner / lineHeight, width: Math.round(b.getBoundingClientRect().width) };
    });
    check("admin row: the builder button is not wrapped",
      !wrapped.missing && wrapped.lines < 1.6, JSON.stringify(wrapped));
  }

  // --- The policy builder, as an EXTENSION PAGE ------------------------------
  // Opened the way Settings opens it, because that is the only way to catch the
  // class of bug that shipped here: the page's logic was an inline <script>,
  // which works over file:// and is silently blocked by Manifest V3's
  // `script-src 'self'` on a chrome-extension:// page. The jsdom test could not
  // see it - runScripts:"dangerously" has no CSP - so the page rendered its
  // shell and wired nothing (roborev 4207).
  {
    const builder = await ctx.newPage();
    const csp = [];
    builder.on("console", (m) => {
      if (/Content Security Policy|Refused to execute/i.test(m.text())) csp.push(m.text().slice(0, 80));
    });
    await builder.goto(`chrome-extension://${id}/options/policy-builder.html`);
    await builder.waitForTimeout(700);
    check("builder: no CSP violation on the extension page", csp.length === 0, csp.join(" | "));
    check("builder: its script actually ran (rows rendered)",
      (await builder.locator(".row, .bpi-row").count()) > 0);
    // On the extension page the runtime import succeeds, so the rows must be
    // the SHARED editor and "Start from my palettes" must be offered (bd uh4).
    // Only this tier can see that: jsdom cannot perform the dynamic import.
    {
      const ready = await builder.evaluate(() => window.policyBuilderReady);
      check("builder: on the extension page the rows are the shared editor",
        ready?.sharedEditor === true && (await builder.locator(".bpi-row").count()) > 0, JSON.stringify(ready));
      check("builder: Start from my palettes is offered on the extension page",
        ready?.importAvailable === true && await builder.locator("#import-palettes").isVisible(), JSON.stringify(ready));
    }
    // The builder links palette-editor.css too, but its own element-type
    // input rule is more specific than a bare class (roborev 5489).
    await checkCopyLayout(builder, "builder");
    check("builder: it produced a policy payload",
      (await builder.locator("#out").innerText()).includes("paletteLocked"),
      "enforcement is ticked by default, so the key should be there");
    check("builder: the preview chip painted from those colors",
      await builder.evaluate(() => !!document.getElementById("preview")?.style.background));
    await builder.close();
  }

  // --- B1/B2: the opt-in, which now defaults ON, and what turning it off does -
  check("B1 Multiple palettes is checked by default",
    await page.locator("#multi-palette").isChecked());
  check("B1 so New palette is offered without turning anything on", await visible("#new-palette"));
  check("B1 selector stays hidden with one palette", !(await visible("#switcher")));
  check("refresh: offered with one palette even though the selector is not",
    await visible("#refresh-palettes"));

  // Opting out must SUPPRESS, never delete - the owner's constraint.
  await page.locator("#multi-palette").uncheck();
  await page.waitForTimeout(300);
  check("B1 opting out hides New palette", !(await visible("#new-palette")));
  await page.locator("#multi-palette").check();
  await page.waitForTimeout(300);
  check("B1 opting back in restores it", await visible("#new-palette"));

  await page.locator("#new-palette").click();
  await page.waitForFunction(() => {
    const s = document.getElementById("switcher");
    return s && !s.hidden && getComputedStyle(s).display !== "none";
  }, null, { timeout: 5000 });
  const opts = await page.locator("#active-palette option").allInnerTexts();
  check("B2 selector appears listing Default + the new palette",
    opts.length === 2 && opts.includes("Default"), opts.join(" | "));
  check("B2 the new palette has one starter color",
    (await page.locator("#rows [data-bpi-row]").count()) === 1);

  // --- Refresh: a rename written BEHIND the page shows up on click ----------
  // Real CSS matters here: the button is icon-only, so a glyph that failed to
  // build, or a rule that collapsed the button, would leave a blank control.
  check("refresh: the button is visible beside the selector", await visible("#refresh-palettes"));
  check("refresh: it has a rendered glyph",
    (await page.locator("#refresh-palettes svg").boundingBox())?.width > 0);
  {
    const activeKey = await page.evaluate(() => new Promise((r) =>
      chrome.storage.sync.get("activePaletteId", (got) => r(`pal:${got.activePaletteId}`))));
    await page.evaluate((key) => new Promise((r) =>
      chrome.storage.sync.get(key, (got) =>
        chrome.storage.sync.set({ [key]: { ...got[key], name: "Renamed elsewhere" } }, r))), activeKey);
    await page.waitForTimeout(200);
    const stale = await page.locator("#active-palette option:checked").innerText();
    check("refresh: nothing moves on its own", stale !== "Renamed elsewhere", stale);
    await page.locator("#refresh-palettes").click();
    await page.waitForFunction(() => /refreshed/i.test(document.getElementById("status").textContent || ""), null, { timeout: 5000 });
    const fresh = await page.locator("#active-palette option:checked").innerText();
    check("refresh: the click pulls the new name in", fresh === "Renamed elsewhere", fresh);
  }

  // --- B6e: import creates a NEW palette and leaves the current one alone -----
  const beforeActive = await page.locator("#active-palette").inputValue();
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
  await page.locator("#text").fill("Poppy #FE5917\nGrass #385834");
  await page.locator("#import").click();
  // 0.2.4: the click asks for a name first. Only this tier can see that the
  // name row is really laid out (it shares .actions, which sets display).
  await page.locator("#import-name-row").waitFor({ state: "visible", timeout: 5000 });
  check("B6e the name step is shown with a suggestion", await page.locator("#import-name").inputValue() === "Imported");
  check("B6e the name field has focus", await page.evaluate(() => document.activeElement?.id === "import-name"));
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => /into a new palette/.test(document.getElementById("status").textContent || ""), null, { timeout: 5000 });
  check("B6e the name step closes after the import", !(await page.locator("#import-name-row").isVisible()));
  const status = await page.locator("#status").innerText();
  const hexes = await page.locator("#rows [data-bpi-hex]").evaluateAll((els) => els.map((e) => e.value));
  check("B6e import creates a palette named Imported", /"Imported"/.test(status), status);
  check("B6e the imported colors are on screen", hexes.join(",") === "#FE5917,#385834", hexes.join(","));
  const afterActive = await page.locator("#active-palette").inputValue();
  check("B6e it switched to the new palette", afterActive !== beforeActive);
  const optionNames = await page.locator("#active-palette option").allInnerTexts();
  check("B6e the palette it was on is still listed", optionNames.length === 3, optionNames.join(" | "));

  // The palette that WAS active must be byte-identical in storage.
  const stored = await page.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
  const keys = Object.keys(stored).filter((k) => k.startsWith("pal:"));
  check("B6e storage holds three palettes", keys.length === 3, keys.join(","));

  // --- Opting out SUPPRESSES palettes, it never deletes them -----------------
  {
    const before = await page.locator("#active-palette option").allInnerTexts();
    check("retention: three palettes exist before opting out", before.length === 3, before.join(" | "));
    await page.locator("#multi-palette").uncheck();
    await page.waitForTimeout(300);
    check("retention: the chooser goes away when you opt out", !(await visible("#switcher")));
    const stored = await page.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
    const keys = Object.keys(stored).filter((k) => k.startsWith("pal:"));
    check("retention: but all three are STILL IN STORAGE", keys.length === 3, keys.join(","));
    await page.locator("#multi-palette").check();
    await page.waitForFunction(() => {
      const el = document.getElementById("switcher");
      return el && !el.hidden && getComputedStyle(el).display !== "none";
    }, null, { timeout: 5000 });
    const after = await page.locator("#active-palette option").allInnerTexts();
    check("retention: opting back in restores the list exactly, in order",
      after.join("|") === before.join("|"), `${before.join("|")} -> ${after.join("|")}`);
  }

  // --- B2b: rename is an inline input, Enter commits -------------------------
  await page.locator("#rename-palette").click();
  await page.locator("#rename-input").fill("Client work");
  await page.locator("#rename-input").press("Enter");
  await page.waitForFunction(() => /renamed/.test(document.getElementById("status").textContent || ""), null, { timeout: 5000 });
  check("B2b rename shows the new name in the selector",
    (await page.locator("#active-palette option").allInnerTexts()).includes("Client work"),
    (await page.locator("#active-palette option").allInnerTexts()).join(" | "));

  // --- B6 (settings): an UNSAVED edit is discarded by a switch ---------------
  {
    const opts = await page.locator("#active-palette option").all();
    const values = await Promise.all(opts.map((o) => o.getAttribute("value")));
    const current = await page.locator("#active-palette").inputValue();
    const other = values.find((v) => v !== current);
    const hex = page.locator("#rows [data-bpi-hex]").first();
    const original = await hex.inputValue();
    await hex.fill("#ABCDEF");                      // typed, never Saved
    await page.locator("#active-palette").selectOption(other);
    await page.waitForTimeout(400);
    await page.locator("#active-palette").selectOption(current);
    await page.waitForTimeout(400);
    const back = await page.locator("#rows [data-bpi-hex]").first().inputValue();
    check("B6 settings discards an unsaved edit across a switch", back === original,
      `expected ${original}, saw ${back}`);
  }

  // --- B6c: Reset is a two-click confirm, and a stray click disarms ----------
  {
    const reset = page.locator("#reset");
    const hex = page.locator("#rows [data-bpi-hex]").first();
    const saved = await hex.inputValue();
    await hex.fill("#010203");
    await reset.click();
    const armedLabel = await reset.innerText();
    check("B6c one click arms rather than resets", /Really reset/i.test(armedLabel), armedLabel);
    check("B6c and nothing has reset yet", (await hex.inputValue()) === "#010203");
    await page.locator("h1, body").first().click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(200);
    check("B6c clicking away disarms it", /^Reset$/i.test((await reset.innerText()).trim()),
      await reset.innerText());
    await reset.click();
    await reset.click();
    await page.waitForTimeout(400);
    check("B6c the second click restores the last SAVED colors",
      (await page.locator("#rows [data-bpi-hex]").first().inputValue()) === saved,
      `expected ${saved}`);
  }

  // --- B6b: Delete is a two-click confirm ------------------------------------
  {
    const del = page.locator("#delete-palette");
    const beforeCount = await page.locator("#active-palette option").count();
    await del.click();
    check("B6b one click arms delete", /Really delete/i.test(await del.innerText()), await del.innerText());
    check("B6b and nothing is deleted yet",
      (await page.locator("#active-palette option").count()) === beforeCount);
    await del.click();
    await page.waitForTimeout(500);
    check("B6b the second click deletes it",
      (await page.locator("#active-palette option").count()) === beforeCount - 1,
      `${beforeCount} -> ${await page.locator("#active-palette option").count()}`);
  }

  // --- B6f: the popup saves on settle, never mid-keystroke -------------------
  // BOTH settle gestures are pinned here with REAL key and focus events, and
  // they can only be pinned here. Tier 1 dispatches a synthetic `change`, which
  // assumes the very browser behavior in question; jsdom cannot produce it. A
  // review (roborev 4106) read the DOM spec and concluded Enter could not settle
  // a bare text input outside a <form> - Chromium fires `change` on Enter
  // regardless, and the field keeps focus. These checks are what settles that
  // question, on the actual engine, rather than by argument.
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.waitForSelector("#rows [data-bpi-hex]", { timeout: 10000 });
  const hexField = popup.locator("#rows [data-bpi-hex]").first();
  await checkCopyLayout(popup, "popup");
  const snapshot = () => popup.evaluate(() => new Promise((r) => chrome.storage.sync.get(null, r)));
  const typeInterim = async (value) => {
    await hexField.click();
    await hexField.press("ControlOrMeta+a");
    await hexField.type(value, { delay: 60 }); // real keystrokes, never settled
    await popup.waitForTimeout(900);           // longer than any old debounce
  };

  const before = await snapshot();
  await typeInterim("#FE5916");
  check("B6f nothing is written while the value is still being typed",
    JSON.stringify(await snapshot()) === JSON.stringify(before));

  await hexField.press("Enter");
  await popup.waitForFunction(() => /Saved/.test(document.getElementById("status").textContent || ""), null, { timeout: 5000 });
  const afterEnter = await snapshot();
  check("B6f a real Enter keypress settles it and it is written",
    JSON.stringify(afterEnter) !== JSON.stringify(before));
  check("B6f Enter did not have to move focus to do it",
    await popup.evaluate(() => document.activeElement?.classList.contains("bpi-hex") === true),
    "the field keeps focus; `change` is what settles, not the blur");

  // The other gesture: typed, then focus moves elsewhere.
  await typeInterim("#010203");
  check("B6f still nothing written before the blur",
    JSON.stringify(await snapshot()) === JSON.stringify(afterEnter));
  await popup.locator("#rows [data-bpi-name]").first().click(); // move focus away
  await popup.waitForFunction(() => /Saved/.test(document.getElementById("status").textContent || ""), null, { timeout: 5000 });
  check("B6f blurring the field settles it too",
    JSON.stringify(await snapshot()) !== JSON.stringify(afterEnter));

} catch (err) {
  // Record it as a failed check rather than only propagating, so the summary
  // below still prints and the exit code still reflects a bad run.
  check("the run reached the end", false, `threw: ${err?.message ?? err}`);
  console.error(err);
} finally {
  await ctx.close().catch(() => {});
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log("Docs/Sheets/Slides and Admin-console policy are NOT covered here; see docs/TESTING-0.2.0.md.");
process.exit(failed.length ? 1 : 0);
