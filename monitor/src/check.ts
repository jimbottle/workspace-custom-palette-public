/**
 * One end-to-end check against the LIVE extension: open a fresh doc, get an
 * editable target, open the picker (which the extension augments with the Brand
 * row), click a Brand swatch, and read back that the color was applied via
 * Google's native Custom row.
 *
 * The monitor uses Playwright's trusted clicks, so the extension's own swatch
 * click handler + custom-color flow run exactly as they do for a real user — we
 * are testing the shipped code path, not reimplementing it.
 *
 * Stages map to the diagnostic `Stage` so a failure points at the right resolver.
 */
import type { Locator, Page } from "@playwright/test";
import { type CheckItem, SELECTORS, checkId } from "./matrix.ts";
import type { CheckResult, Stage } from "./diagnostics.ts";

class StageError extends Error {
  // Explicit field (not a TS parameter property): node --experimental-strip-types
  // runs in strip-only mode and does not support `constructor(public x)` shorthand.
  stage: Stage;
  constructor(stage: Stage, message: string) {
    super(message);
    this.stage = stage;
  }
}

/**
 * Best-effort dismissal of the promo dialogs Google shows on a fresh doc.
 *
 * Escape first, and deliberately so: the button-text pass below only matches an
 * English UI, and a promo left standing intercepts the toolbar click, which
 * fails the run at `open-picker` and blames the toolbar selector. That drives
 * the remediation loop into a false RED against a contract that is fine — so on
 * a non-English account the text pass is not just useless but actively
 * misleading. Escape closes these dialogs in any language; the labels stay as a
 * fallback for the ones it does not.
 */
async function dismissPromos(page: Page): Promise<void> {
  await page.keyboard.press("Escape").catch(() => {});
  for (const label of ["Got it", "No thanks", "Dismiss", "Close"]) {
    const btn = page.getByRole("button", { name: label, exact: true }).first();
    if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
  }
  await page.keyboard.press("Escape").catch(() => {}); // any dialog the labels revealed
}

/**
 * Does an observed `lang` attribute satisfy the language a leg asked for?
 *
 * Primary subtag only, so "da" matches "da-DK" and "en" matches "en-GB" — the
 * leg cares which language Google rendered, not which regional variant. An
 * empty or missing `lang` is not a satisfying tag, so it is `false`.
 *
 * This answers only "does this tag satisfy that language". What to DO about a
 * `false` — fail the run, or warn and continue — is a separate question, and
 * deliberately not decided here: see `localeVerdict`.
 */
export function localeMatches(got: string, want: string): boolean {
  const primary = (tag: string) => String(tag ?? "").toLowerCase().split("-")[0] ?? "";
  const g = primary(got);
  return g !== "" && g === primary(want);
}

/** The outcome of reading `<html lang>`: a tag, or why we could not get one. */
export type LangRead = { ok: true; lang: string } | { ok: false; error: string };

/** What a locale observation should cause. `fail` throws; `warn` is reported but green. */
export type LocaleVerdict =
  | { action: "pass" }
  | { action: "warn"; message: string }
  | { action: "fail"; message: string };

/**
 * The fail-vs-warn policy, as a pure function so it can be held still by tests.
 *
 * THE RULE: fail on POSITIVE EVIDENCE of the wrong language, on ANY leg — a
 * real language tag that disagrees with the one the leg expects — and on an
 * EMPTY `lang`. Only an unreadable page warns and continues, because an
 * `evaluate` that throws is a navigation race, not evidence about language.
 *
 * Why every branch can now fail closed: `documentElement.lang` has been read
 * live on all three apps in both conditions (bd `workspace-custom-palette-afb`;
 * table in docs/TEST_PLAN.md) — Docs, Sheets and Slides report "en" on the
 * account's own language and "da" under `?hl=da&forcehl=1`, and the attribute
 * was PRESENT on all six reads. Before those six values existed the English
 * leg and the blank case were advisory, since a gate that fails closed on an
 * unverified attribute turns the project's single authoritative breakage signal
 * into a permanent false RED. That evidence now exists, and each promoted case
 * catches a real way for a leg to stop testing what it claims: an English leg
 * reading "da" means the shared profile's language changed and every English
 * result is suspect; a blank means Google stopped setting the attribute, at
 * which point the Danish legs' only proof of being Danish is gone.
 *
 * This lives out here rather than inside `assertLocale` because the policy IS
 * the thing worth protecting, and inside an unexported async function needing a
 * `Page` no test could catch a change to it.
 */
export function localeVerdict(read: LangRead, want: string, isLocaleLeg: boolean): LocaleVerdict {
  if (!read.ok) {
    return { action: "warn", message: `could not read <html lang> (${read.error}); locale not verified this run` };
  }
  if (!read.lang) {
    // Every live read so far (three apps, two languages) carried the attribute,
    // so a blank is a change on Google's side, not a known transient.
    return {
      action: "fail",
      message: `the editor reported no <html lang>; expected "${want}". Google has always set it (see ` +
        `docs/TEST_PLAN.md), so a blank means the locale legs can no longer prove which language they ran in`,
    };
  }
  if (localeMatches(read.lang, want)) return { action: "pass" };
  if (isLocaleLeg) {
    return {
      action: "fail",
      message: `expected a "${want}" UI but the editor reported lang="${read.lang}" - hl/forcehl did not take, ` +
        `so this leg would have silently re-run the English check`,
    };
  }
  return {
    action: "fail",
    message: `expected an "${want}" UI but the editor reported lang="${read.lang}" - the test account's ` +
      `language has changed, which invalidates every English leg until it is set back`,
  };
}

/**
 * Read `<html lang>`, keeping "could not read it" distinct from "it says X".
 *
 * Collapsing both into `""` would report a navigation race as a locale
 * mismatch: Docs continues client-side navigating after `load` (the
 * `/create` -> `/d/<id>/edit` path), so an `evaluate` a couple of seconds in can
 * lose its execution context. That is a transient infrastructure hiccup, not
 * evidence about the language, and the diagnostic bundle should say so.
 */
async function readLang(page: Page): Promise<LangRead> {
  try {
    const lang = await page.evaluate(() => document.documentElement.lang);
    return { ok: true, lang: String(lang ?? "") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Verify the editor came up in the language this leg exists to test.
 *
 * Without this, a `locale` leg proves nothing. The URL asking for Danish and the
 * UI being Danish are different claims, and only the second one is the invariant
 * — `forcehl=1` is Google's behavior, not ours, and it can stop working (or be
 * dropped across the create -> /d/<id>/edit redirect, or be overridden by a
 * Workspace policy on the test account) at any time. If that happened the two
 * `(da)` rows would quietly become duplicates of the English rows and stay green
 * forever, which is worse than not having them.
 *
 * Page reads only; the fail-vs-warn decision is `localeVerdict`. Returns the
 * warnings to report (never throws for a warn), and throws a StageError for the
 * one case that is unambiguous and verified.
 */
async function assertLocale(page: Page, item: CheckItem): Promise<string[]> {
  const want = item.locale ?? "en";

  let read = await readLang(page);
  // One retry: an unreadable page or a blank lang this early is most likely the
  // post-load client-side navigation, not a real answer.
  //
  // The wait is guarded because it is a Playwright call on a page that may
  // ALREADY be gone — the most likely reason the first read failed. An unguarded
  // rejection here is not a StageError, so runCheck's catch would default it to
  // stage "apply" and report a browser-lifecycle failure to the remediation loop
  // as a broken custom-color selector. That is exactly the misattribution the
  // discriminated LangRead exists to prevent, one line further down.
  if (!read.ok || !read.lang) {
    await page.waitForTimeout(1500).catch(() => {});
    read = await readLang(page);
  }

  const verdict = localeVerdict(read, want, !!item.locale);
  if (verdict.action === "fail") throw new StageError("open-doc", verdict.message);
  return verdict.action === "warn" ? [verdict.message] : [];
}

/** Get an editable target selected so the picker is enabled and apply has effect. */
async function runOpener(page: Page, item: CheckItem): Promise<void> {
  switch (item.opener) {
    case "sheets-cell":
      // A1 is selected by default on a new sheet; nothing to do.
      return;
    case "docs-text":
      await page.keyboard.type("brand");
      await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      return;
    case "slides-shape":
      // Tab selects the first placeholder on the slide, exposing fill/border.
      await page.keyboard.press("Tab");
      return;
    case "sheets-border": {
      // The border colour pencil (#t-border-color) lives INSIDE the Borders
      // palette, so it is not clickable until #t-border opens it. The palette
      // CLOSES when the custom-colour dialog's OK fires (bd 9qg, 2026-09-01;
      // seen again on the 2026-10-01 manual run), so `reopenForReadback`
      // opens it again before the read-back clicks the pencil. An earlier
      // note here said the palette stays open; that was observed on a
      // fast-path pick, where no dialog opens.
      await openBordersPalette(page);
      return;
    }
    case "docs-table": {
      // Insert a 1x1 table through the Insert menu by KEYBOARD, the only
      // locale-independent route: the menu items carry no ids and their text
      // is translated. Verified live 2026-08-30: Down, Down lands on Table;
      // Right opens its submenu on "Building blocks"; Down moves to the
      // dimension picker; Enter inserts 1x1 with the caret in the cell. The
      // table toolset then mounts, inline or behind #moreButton when the
      // toolbar is too narrow, so open the overflow if the button is hidden.
      await page.locator("#docs-insert-menu").first().click({ timeout: 8000 });
      for (const key of ["ArrowDown", "ArrowDown", "ArrowRight", "ArrowDown", "Enter"]) {
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(800);
      const btn = page.locator(item.toolbarButton).first();
      if (!(await btn.isVisible().catch(() => false))) {
        await page.locator("#moreButton").first().click({ timeout: 5000 });
        await btn.waitFor({ state: "visible", timeout: 5000 });
      }
      return;
    }
  }
}

async function openBordersPalette(page: Page): Promise<void> {
  await page.locator("#t-border").first().click({ timeout: 8000 });
  await page.locator("#t-border-color").first().waitFor({ state: "visible", timeout: 5000 });
}

/**
 * Bring the toolbar button back into layout for the read-back when the
 * dialog's OK closed the menu it sits in. This is deliberately NOT a re-run of
 * `runOpener`: most openers change the document when run twice (docs-table
 * inserts another table and moves the caret into a fresh, uncoloured cell;
 * docs-text retypes over the selection; slides-shape Tabs to a different
 * placeholder), and a read-back against a changed target is a misattributed
 * RED. Only the pure "open a container" steps are repeated here.
 *
 * Returns null on success or a description of what failed, so the caller can
 * name the real cause instead of the generic "did not re-open".
 */
async function reopenForReadback(page: Page, item: CheckItem, openBtn: Locator): Promise<string | null> {
  if (await openBtn.isVisible().catch(() => false)) return null;
  try {
    switch (item.opener) {
      case "sheets-border":
        await openBordersPalette(page);
        return null;
      case "docs-table":
        // The table toolset may live behind the toolbar overflow; that overflow
        // can close with the dialog. Re-open it, never the Insert menu.
        await page.locator("#moreButton").first().click({ timeout: 5000 });
        await openBtn.waitFor({ state: "visible", timeout: 5000 });
        return null;
      default:
        return `toolbar button ${item.toolbarButton} lost its layout and opener ${item.opener} cannot be safely repeated`;
    }
  } catch (e) {
    return `${item.opener} reopen failed: ${String(e)}`;
  }
}

/**
 * Run a single check. Returns a CheckResult; never throws (errors are captured
 * as a failed stage).
 */
export async function runCheck(page: Page, item: CheckItem): Promise<CheckResult> {
  const id = checkId(item);
  // Collected across the check and attached to the result whether it passes or
  // fails, so a green run can still carry something a human needs to see.
  const warnings: string[] = [];
  try {
    await page.goto(item.newDocUrl, { waitUntil: "load", timeout: 45000 }).catch(() => {
      throw new StageError("open-doc", `could not open ${item.newDocUrl}`);
    });
    await page.waitForTimeout(2500); // let the editor + extension content script settle
    warnings.push(...(await assertLocale(page, item)));
    await dismissPromos(page);

    await runOpener(page, item).catch((e) => { throw new StageError("opener", String(e)); });

    // Open the picker (trusted click). The extension injects the Brand row.
    const openBtn = page.locator(item.toolbarButton).first();
    await openBtn.click({ timeout: 8000 }).catch(() => { throw new StageError("open-picker", `toolbar button not clickable: ${item.toolbarButton}`); });

    // Detect the open picker by the CONTRACT signal — a visible custom-color
    // button — not the outer menu class (which varies per app; see the
    // google-picker-contract memory). The brand row is uniquely labeled, so we
    // locate it page-wide rather than scoping to a menu wrapper.
    const customBtn = page.locator(`${SELECTORS.customColorButton}:visible`).first();
    await customBtn.waitFor({ state: "visible", timeout: 8000 }).catch(() => { throw new StageError("open-picker", "picker did not appear (no visible custom-color button)"); });

    const brandSwatch = page.locator(`${SELECTORS.brandSwatch}:visible`).first();
    await brandSwatch.waitFor({ state: "visible", timeout: 5000 }).catch(() => { throw new StageError("inject", "Brand row not injected into picker"); });

    // The "Brand" label must ALSO be visible: without it the row blends into
    // Google's grid and reads as missing to users — exactly the 2026-08-15 field
    // reports (Docs has no .goog-menuheader, so the label was silently skipped
    // while this check stayed green). A user-visible feature check, not a DOM one.
    const brandLabel = page.locator(`${SELECTORS.brandLabel}:visible`).first();
    await brandLabel.waitFor({ state: "visible", timeout: 5000 }).catch(() => { throw new StageError("inject", "Brand LABEL not visible — the row would blend into the native grid unlabeled"); });

    // Third user-visible property of the smoke matrix: the tooltip. The 0.1.4
    // clones kept the source swatch's inner title ("Black"/"Sort", per UI
    // language), and the INNERMOST title wins on hover — a failure mode only
    // visible in the live DOM. Assert BOTH tooltip sources Google's picker
    // uses: the innermost [title] AND, when present, the innermost
    // [data-tooltip] (Google's own tooltip layer reads it and would show a
    // stale clone name even with every title correctly rewritten). Each
    // innermost value must carry the brand name from the swatch's aria-label.
    const tooltipOk = await brandSwatch.evaluate((el) => {
      const name = (el.getAttribute("aria-label") ?? "").replace(/^Brand:\s*/, "");
      if (name.length === 0) return false;
      const innermost = (attr: string) => {
        const els = [el, ...Array.from(el.querySelectorAll(`[${attr}]`))].filter((e) => e.hasAttribute(attr));
        const last = els[els.length - 1];
        return last ? last.getAttribute(attr) ?? "" : null;
      };
      const title = innermost("title");
      const dataTooltip = innermost("data-tooltip");
      if (title === null && dataTooltip === null) return false; // injector always sets a title; none at all is a regression
      return (title === null || title.startsWith(name)) && (dataTooltip === null || dataTooltip.startsWith(name));
    }).catch(() => false);
    if (!tooltipOk) throw new StageError("inject", "Brand swatch tooltip (innermost title/data-tooltip) does not show the brand color name");

    // Fourth: the clone must not have inherited Google's "this is the applied
    // colour" state. Unit tests can only assert this against a fixture authored
    // to match the contract token — if Google's real class differs, or moves to
    // a child node, jsdom stays green and the checkmark returns in the field.
    // This is the picker where it reproduces (the source cell is the active
    // colour), so the live check is the one that actually holds the line.
    const selectedState = await brandSwatch.evaluate((el, cls) => {
      const nodes = [el, ...Array.from(el.querySelectorAll("*"))];
      const bad = nodes.find((n) => n.classList.contains(cls) || n.getAttribute("aria-selected") === "true");
      return bad ? (bad.getAttribute("class") ?? "aria-selected") : null;
    }, SELECTORS.swatchSelected).catch(() => null);
    if (selectedState !== null) {
      throw new StageError("inject", `Brand swatch carries Google's selected state (${selectedState}) — cloned from the active cell`);
    }

    // Expected applied color = the clicked Brand swatch's own background. If we
    // can't read it, that's an injection-markup problem, not a read-back miss —
    // label it accordingly so a fixer looks at the right resolver.
    const expectedRgb = await brandSwatch.evaluate((el) => {
      const inner = el.querySelector("div") ?? el;
      return getComputedStyle(inner as Element).backgroundColor;
    }).catch(() => "");
    if (!expectedRgb) throw new StageError("inject", "could not read the Brand swatch's color");

    // Click it — the extension drives the native custom-color apply flow.
    await brandSwatch.click({ timeout: 5000 }).catch(() => { throw new StageError("apply", "could not click Brand swatch"); });
    // Allow the full apply flow to finish: dialog open -> set hex -> OK ->
    // (Sheets) reopen picker -> click the registered custom swatch. This is
    // multi-step, so wait generously before reading back.
    await page.waitForTimeout(4500);

    // Read back: re-open the picker and read the color the picker marks as the
    // CURRENT selection (aria-selected). This reflects the fresh target's actual
    // color, so it is robust to the persistent/deduped Custom row (a count delta
    // would false-RED on repeat runs) AND to a brand color matching a default
    // swatch (the selected one is still the applied one). Verified live: the
    // active color's cell has aria-selected="true"; custom colors carry the hex
    // in the aria-label, default swatches carry it on the inner div.
    // Some openers are nested inside a menu the dialog's OK closed (the Sheets
    // Borders palette, bd 9qg). The pencil is then still a valid node but has no
    // layout, so the click below would silently no-op and the row would
    // false-RED as "did not re-open". Restore the container first, and keep
    // whatever went wrong doing so for the error message.
    const reopenProblem = await reopenForReadback(page, item, openBtn);
    await openBtn.click({ timeout: 8000 }).catch(() => {});
    await customBtn.waitFor({ state: "visible", timeout: 8000 }).catch(() => {
      throw new StageError("readback", `picker did not re-open for read-back${reopenProblem ? ` (${reopenProblem})` : ""}`);
    });
    const selectedRgb = await page.evaluate(({ cellSel }) => {
      const hexToRgb = (h: string) => `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      const cells = Array.from(document.querySelectorAll(`${cellSel}[aria-selected="true"]`))
        .filter((el) => (el as HTMLElement).getClientRects().length > 0); // visible picker only
      const sel = cells[0];
      if (!sel) return null;
      const m = /#([0-9a-fA-F]{6})/.exec(sel.getAttribute("aria-label") ?? "");
      if (m && m[1]) return hexToRgb(m[1]);
      const inner = sel.querySelector("div");
      return inner ? getComputedStyle(inner).backgroundColor : null;
    }, { cellSel: SELECTORS.swatchCell });

    if (selectedRgb !== expectedRgb) {
      throw new StageError("readback", `current selected color is ${selectedRgb ?? "none"}, expected ${expectedRgb} — apply did not land`);
    }

    return { id, label: item.label, ok: true, warnings };
  } catch (e) {
    const stage = e instanceof StageError ? e.stage : "apply";
    return { id, label: item.label, ok: false, stage, error: e instanceof Error ? e.message : String(e), warnings };
  }
}

/** Capture the diagnostic artifacts for a failed check (picker HTML, a11y, screenshot). */
export async function capture(page: Page, id: string, screenshotDir: string): Promise<{ url: string; pickerOuterHtml: string | null; a11yTree: unknown; screenshotPath: string | null }> {
  const url = page.url();
  const visiblePicker = page.locator(`${SELECTORS.gooMenu}:visible`).first();
  const pickerOuterHtml = await visiblePicker.evaluate((el) => el.outerHTML).catch(() => null);
  // Modern Playwright a11y capture (page.accessibility was removed): the picker's
  // ARIA tree as a YAML snapshot, useful for spotting role/label changes.
  const a11yTree: unknown = await visiblePicker.ariaSnapshot().catch(() => null);
  const screenshotPath = `${screenshotDir}/${id}.png`;
  const ok = await page.screenshot({ path: screenshotPath, fullPage: false }).then(() => true).catch(() => false);
  return { url, pickerOuterHtml, a11yTree, screenshotPath: ok ? screenshotPath : null };
}
