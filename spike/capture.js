/*
 * Phase 0 feasibility spike — THROWAWAY.
 *
 * Goal: de-risk the whole project by answering two questions in the LIVE app,
 * signed into a real Google account:
 *   1. Can we reliably detect a color picker opening and read its DOM?
 *   2. Can we drive Google's own "custom color -> set hex -> confirm" flow so a
 *      brand hex applies to the current selection?
 *
 * This is not shipping code. It uses NO saved selectors — it discovers picker
 * popups heuristically and dumps everything we need to write the real
 * dom-contract (see docs/SPEC.md §2). Nothing here is meant to survive into
 * Phase 1; it is a capture + probe instrument.
 *
 * Usage: load spike/ unpacked in a Chrome signed into the target Google
 * account, open a Sheet, select a cell, open the fill-color picker, then read
 * the console (filter: "[spike]"). Captured popup HTML is also copied to the
 * clipboard.
 */
(() => {
  "use strict";

  const TAG = "[spike]";
  const log = (...a) => console.log(TAG, ...a);
  const APP = (() => {
    const p = location.pathname;
    if (p.startsWith("/spreadsheets/")) return "sheets";
    if (p.startsWith("/document/")) return "docs";
    if (p.startsWith("/presentation/")) return "slides";
    return "unknown";
  })();

  log(`loaded on ${APP} — watching for color-picker popups`);

  // ---- Heuristics for "this looks like a color picker popup" -----------------
  // Google color pickers are menu/dialog popups containing a grid of small
  // single-color swatch cells. We score a freshly-added subtree on those signals
  // rather than hard-coding a class, so the spike works across all apps/pickers.
  const RGB_BG = /rgb\(|#/i;

  function looksLikeSwatch(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.width > 32 || r.height < 8 || r.height > 32) return false;
    const bg = getComputedStyle(el).backgroundColor;
    return RGB_BG.test(bg) && bg !== "rgba(0, 0, 0, 0)";
  }

  function scorePicker(root) {
    const cells = Array.from(root.querySelectorAll("*")).filter(looksLikeSwatch);
    return { count: cells.length, cells };
  }

  // Candidate selector suggestions for a node — prefer stable hooks.
  function describe(el) {
    if (!el) return null;
    const attrs = {};
    for (const name of ["role", "aria-label", "jsname", "data-id", "data-tooltip", "aria-haspopup"]) {
      const v = el.getAttribute && el.getAttribute(name);
      if (v) attrs[name] = v;
    }
    return {
      tag: el.tagName?.toLowerCase(),
      classes: (el.className && el.className.toString().slice(0, 120)) || null,
      attrs,
      rect: (() => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
    };
  }

  function dump(label, root) {
    const { count, cells } = scorePicker(root);
    if (count < 6) return false; // not enough swatches to be a color grid
    const sample = cells[0];
    const grid = sample?.parentElement;
    const report = {
      app: APP,
      label,
      swatchCount: count,
      popupRoot: describe(root),
      swatchGrid: describe(grid),
      swatchCell: describe(sample),
      swatchCellBg: sample && getComputedStyle(sample).backgroundColor,
      // Candidate "custom color" entry: a clickable item whose label mentions custom.
      customColorCandidate: describe(
        root.querySelector('[aria-label*="ustom" i],[data-tooltip*="ustom" i]')
      ),
      outerHTMLLength: root.outerHTML.length,
    };
    log("PICKER DETECTED →", report);
    log("popup outerHTML follows (also copied to clipboard):");
    console.log(root.outerHTML);
    try {
      navigator.clipboard?.writeText(root.outerHTML);
      log("✓ outerHTML copied to clipboard");
    } catch (e) {
      log("clipboard copy failed (expected if tab not focused):", e?.message);
    }
    window.__spikeLastPicker = root; // for manual poking in the console
    log("tip: window.__spikeLastPicker holds the popup node for manual inspection");
    return true;
  }

  // ---- Watch the DOM for popups mounting (and re-showing) --------------------
  const seen = new WeakSet();

  // Retry the dump a few times: a popup's swatch cells may not have finished
  // layout on the first frame (getBoundingClientRect 0x0 -> looksLikeSwatch
  // rejects them -> picker missed on timing luck). Re-try on a short delay.
  function scheduleDump(node, attempt = 0) {
    if (!node || node.nodeType !== 1) return;
    requestAnimationFrame(() => {
      let ok = false;
      try { ok = dump("candidate", node); } catch (_) {}
      if (!ok && attempt < 4) setTimeout(() => scheduleDump(node, attempt + 1), 150);
    });
  }
  const consider = (node) => {
    if (!node || node.nodeType !== 1 || seen.has(node)) return;
    seen.add(node);
    scheduleDump(node);
  };

  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") {
        for (const node of m.addedNodes) consider(node);
      } else if (m.type === "attributes" && m.target.nodeType === 1) {
        // Google often mounts a popup once and toggles visibility on reopen, so
        // a re-shown popup fires no childList mutation. Re-consider on attribute
        // changes (clear `seen` so it re-dumps).
        seen.delete(m.target);
        consider(m.target);
      }
    }
  });
  obs.observe(document.body, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ["style", "class", "aria-hidden", "hidden"],
  });

  // A popup already present at document_idle never fires a childList mutation —
  // scan existing candidates once at startup. Narrow to popup-ish containers so
  // we don't schedule timers for every <div> on the page (Docs has thousands).
  for (const el of document.querySelectorAll('.goog-menu,[role="menu"],[role="dialog"],.docs-material-colorpalette')) {
    consider(el);
  }

  // ---- Manual probe: drive the custom-color apply flow ----------------------
  // Call window.__spikeApply("#1A73E8") AFTER opening a picker, to test whether
  // the custom-color sequence commits a hex to the current selection. This is
  // the core de-risking step. It logs each step so we can record the exact
  // event sequence in docs/SPEC.md §3.
  window.__spikeApply = (hex) => {
    const root = window.__spikeLastPicker || document;
    log(`__spikeApply(${hex}) — attempting custom-color flow`);
    const customBtn = root.querySelector('[aria-label*="ustom" i],[data-tooltip*="ustom" i]');
    if (!customBtn) { log("✗ no custom-color button found in last picker"); return; }
    customBtn.click();
    log("clicked custom-color entry; looking for hex input…");
    setTimeout(() => {
      // Scope to the custom-color dialog so we don't grab an unrelated text
      // field (search box, doc title). Prefer the hex-labeled input.
      const dialog = document.querySelector('.docs-material-gm-dialog-content,[role="dialog"]');
      const scope = dialog || document;
      const input = scope.querySelector('input[aria-label*="ex" i]') || scope.querySelector('input[type="text"]');
      if (!input) { log("✗ no hex input found in custom-color dialog"); return; }
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, hex.replace(/^#/, ""));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      log("set hex + dispatched input/change/Enter. Look for an OK/apply button:");
      log(describe(document.querySelector('[aria-label*="OK" i],button')));
      log("→ record in SPEC §3 which of these events actually committed the value");
    }, 250);
  };

  log('ready. Open a picker, then call __spikeApply("#1A73E8") in the console.');
})();
