/**
 * The policy builder's logic, in its own file for one hard reason: Manifest V3's
 * default extension_pages CSP is `script-src 'self'`, which forbids inline
 * <script> and cannot be loosened with 'unsafe-inline'. As an inline block this
 * worked over file:// - which has no CSP - and was silently INERT the moment the
 * page was opened from Settings as a chrome-extension:// page: shell rendered,
 * nothing wired (roborev 4207, reproduced in a real browser).
 *
 * The jsdom test could not have caught it; it loads the file with
 * runScripts: "dangerously", which has no concept of the extension's CSP. The
 * real-Chromium page smoke now opens this page for exactly that reason.
 *
 * WHY THIS IS A CLASSIC SCRIPT THAT IMPORTS, NOT A MODULE. The page has to work
 * in two places: opened from Settings as an extension page, and double-clicked
 * from Finder by an administrator who has no extension (TESTING-0.2.0 NEW-3).
 * Chrome treats a file:// page as origin "null" and refuses to load ES modules
 * into it, so `<script type="module">` would leave a mailed copy blank. A
 * classic script can still `import()` at runtime, and that import either
 * succeeds (extension page) or throws (file://), which is a clean fork:
 *   - success: the rows are the SAME editor Settings and the popup use
 *     (shared/palette-editor.js) - reorder, delete, the colour chip, the
 *     eyedropper - and "Start from my palettes" reads the admin's own
 *     palettes out of chrome.storage.sync through lib/storage.js.
 *   - failure: today's self-contained rows, no import control, no error.
 * The page renders the self-contained rows FIRST and upgrades when the import
 * lands, so a mailed copy never waits on a load that will not come.
 */
(function () {
  "use strict";

  // Both mirror lib/palette.js. A generator that caps LOWER than the extension
  // sends an admin back to hand-writing the JSON it exists to spare them, so
  // the test asserts these against the real exports rather than trusting the
  // comment (which was wrong: this said 10 against a real cap of 12).
  const MAX_SWATCHES = 24;   // MAX_SWATCHES in lib/palette.js
  const MAX_PALETTES = 12;   // MAX_PALETTES in lib/palette.js

  /** @type {{name: string, swatches: {name: string, hex: string}[]}[]} */
  let palettes = [{
    name: "Brand",
    swatches: [
      { name: "Poppy", hex: "#FE5917" },
      { name: "Sunshine", hex: "#EABF26" },
      { name: "Grass", hex: "#385834" }
    ]
  }];

  /**
   * What the runtime import produced, or null when it could not load (file://,
   * or a copy mailed without the shared/ and lib/ folders beside it).
   * @type {null | { mountPaletteEditor?: Function, getPaletteState?: Function }}
   */
  let deps = null;

  const host = /** @type {HTMLElement} */ (document.getElementById("palettes"));
  const out = /** @type {HTMLElement} */ (document.getElementById("out"));
  const problems = /** @type {HTMLElement} */ (document.getElementById("problems"));
  const addPaletteBtn = /** @type {HTMLButtonElement} */ (document.getElementById("add-palette"));
  const lockedEl = /** @type {HTMLInputElement} */ (document.getElementById("locked"));
  const importBox = /** @type {HTMLElement} */ (document.getElementById("import"));
  const importBtn = /** @type {HTMLButtonElement} */ (document.getElementById("import-palettes"));
  const importNote = /** @type {HTMLElement} */ (document.getElementById("import-note"));

  function mode() {
    const el = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name="mode"]:checked'));
    return el ? el.value : "one";
  }

  /** @param {string} value */
  function setMode(value) {
    const radio = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name="mode"][value="' + value + '"]'));
    if (radio) radio.checked = true;
  }

  /** @param {unknown} v @returns {boolean} */
  function isValidHex(v) {
    return /^#[0-9a-fA-F]{6}$/.test(String(v || "").trim());
  }

  // Accepts "1A73E8" as well as "#1A73E8", because that is what people paste
  // out of a brand guide.
  /** @param {unknown} v @returns {string} */
  function normalizeHex(v) {
    let s = String(v || "").trim();
    if (/^[0-9a-fA-F]{6}$/.test(s)) s = "#" + s;
    return isValidHex(s) ? s.toUpperCase() : s;
  }

  /** @param {string} tag @param {string} [cls] @returns {any} */
  function el(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  // ---- The self-contained rows: what a mailed copy renders --------------------

  /** @param {any} p @param {any} sw @param {number} i @returns {any} */
  function renderSwatchRow(p, sw, i) {
    const row = el("div", "row");

    const chip = el("input");
    chip.type = "color";
    chip.value = isValidHex(sw.hex) ? sw.hex : "#000000";
    chip.setAttribute("aria-label", "Pick color " + (i + 1));

    const name = el("input", "cname");
    name.type = "text";
    name.value = sw.name;
    name.placeholder = "Color name";
    name.setAttribute("aria-label", "Name for color " + (i + 1));

    const hex = el("input", "chex");
    hex.type = "text";
    hex.value = sw.hex;
    hex.placeholder = "#1A73E8";
    hex.setAttribute("aria-label", "Hex for color " + (i + 1));
    if (!isValidHex(sw.hex)) hex.classList.add("bad");

    chip.addEventListener("input", function () {
      sw.hex = chip.value.toUpperCase();
      hex.value = sw.hex;
      hex.classList.remove("bad");
      refreshOutput();
    });
    name.addEventListener("input", function () { sw.name = name.value; refreshOutput(); });
    hex.addEventListener("input", function () {
      sw.hex = hex.value;
      const ok = isValidHex(normalizeHex(hex.value));
      hex.classList.toggle("bad", !ok);
      if (ok) chip.value = normalizeHex(hex.value);
      refreshOutput();
    });
    hex.addEventListener("change", function () {
      sw.hex = normalizeHex(hex.value);
      hex.value = sw.hex;
      refreshOutput();
    });

    const remove = el("button", "icon");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove color " + (i + 1));
    remove.addEventListener("click", function () {
      p.swatches.splice(i, 1);
      render();
    });

    row.appendChild(chip);
    row.appendChild(name);
    row.appendChild(hex);
    row.appendChild(remove);
    return row;
  }

  /**
   * The rows of one palette. Uses the extension's shared editor when the
   * runtime import produced one, so this page and Settings are literally the
   * same code; otherwise the self-contained rows above.
   * @param {any} p @param {any} box
   */
  function renderRows(p, box) {
    const add = el("button");
    add.type = "button";
    add.textContent = "Add color";
    add.disabled = p.swatches.length >= MAX_SWATCHES;

    if (deps && typeof deps.mountPaletteEditor === "function") {
      const rows = el("div", "rows");
      box.appendChild(rows);
      const editor = deps.mountPaletteEditor(rows, {
        initial: p.swatches.map(function (/** @type {any} */ s, /** @type {number} */ i) { return { name: s.name, hex: s.hex, order: i }; }),
        maxSwatches: MAX_SWATCHES,
        doc: document,
        // Every edit, settled or not, flows through the SAME payload build and
        // validation as a typed one: the editor hands back raw field values and
        // buildPolicy's clean() decides what is usable.
        onChange: function (/** @type {any[]} */ working) {
          p.swatches = working.map(function (/** @type {any} */ s) { return { name: s.name, hex: s.hex }; });
          add.disabled = p.swatches.length >= MAX_SWATCHES;
          refreshOutput();
        },
      });
      add.addEventListener("click", function () { editor.addRow(); });
    } else {
      p.swatches.forEach(function (/** @type {any} */ sw, /** @type {number} */ i) { box.appendChild(renderSwatchRow(p, sw, i)); });
      add.addEventListener("click", function () {
        p.swatches.push({ name: "New color", hex: "#1A73E8" });
        render();
      });
    }

    const actions = el("div", "actions");
    actions.appendChild(add);
    box.appendChild(actions);
  }

  /** @param {any} p @param {number} pi @returns {any} */
  function renderPalette(p, pi) {
    const box = el("div", "palette");

    if (mode() === "many") {
      const head = el("div", "palette-head");
      const label = el("label");
      label.textContent = "Palette name";
      label.style.color = "var(--muted)";
      const pname = el("input");
      pname.type = "text";
      pname.value = p.name;
      pname.placeholder = "Retail";
      pname.setAttribute("aria-label", "Name for palette " + (pi + 1));
      pname.addEventListener("input", function () { p.name = pname.value; refreshOutput(); });
      head.appendChild(label);
      head.appendChild(pname);
      if (palettes.length > 1) {
        const del = el("button", "icon");
        del.type = "button";
        del.textContent = "Remove palette";
        del.addEventListener("click", function () { palettes.splice(pi, 1); render(); });
        head.appendChild(del);
      }
      box.appendChild(head);
    }

    renderRows(p, box);
    return box;
  }

  function render() {
    host.replaceChildren();
    const many = mode() === "many";
    if (!many && palettes.length > 1) palettes = [/** @type {any} */ (palettes[0])];
    palettes.forEach(function (/** @type {any} */ p, /** @type {number} */ i) { host.appendChild(renderPalette(p, i)); });
    addPaletteBtn.hidden = !many;
    addPaletteBtn.disabled = palettes.length >= MAX_PALETTES;
    refreshOutput();
  }

  // The Value wrapper is how Chrome delivers a typed policy value; the console
  // rejects the payload without it, which is exactly the step this page exists
  // to take off an admin's hands.
  function buildPolicy() {
    const many = mode() === "many";
    const policy = {};
    /** @param {any[]} list @returns {any[]} */
    function clean(list) {
      return list
        .filter(function (/** @type {any} */ sw) { return sw.name.trim() && isValidHex(normalizeHex(sw.hex)); })
        .slice(0, MAX_SWATCHES)
        .map(function (/** @type {any} */ sw) { return { name: sw.name.trim(), hex: normalizeHex(sw.hex) }; });
    }
    if (many) {
      policy.palettes = { Value: palettes.slice(0, MAX_PALETTES).map(function (/** @type {any} */ p) {
        return { name: p.name.trim() || "Palette", swatches: clean(p.swatches) };
      }) };
    } else {
      policy.palette = { Value: clean(palettes[0] ? palettes[0].swatches : []) };
    }
    if (lockedEl.checked) policy.paletteLocked = { Value: true };
    return policy;
  }

  function listProblems() {
    const many = mode() === "many";
    const msgs = [];
    const built = buildPolicy();
    palettes.forEach(function (/** @type {any} */ p, /** @type {number} */ pi) {
      const label = p.name.trim() || "palette " + (pi + 1);
      const where = many ? ' in "' + label + '"' : "";
      p.swatches.forEach(function (/** @type {any} */ sw, /** @type {number} */ i) {
        if (!sw.name.trim()) msgs.push("Color " + (i + 1) + where + " has no name, so it will be skipped.");
        else if (!isValidHex(normalizeHex(sw.hex))) {
          msgs.push('"' + sw.name.trim() + '"' + where + " is not a six-digit hex color, so it will be skipped.");
        }
      });
      if (p.swatches.length > MAX_SWATCHES) {
        msgs.push("Only the first " + MAX_SWATCHES + " colors" + where + " are published.");
      }
      // A palette with nothing usable in it is dropped ENTIRELY by the
      // extension (normalizeOrgPalettes skips any entry with no colors), and
      // one empty palette beside full ones used to pass without a word - the
      // admin would publish a name that simply never appears. Whole-payload
      // emptiness is a different, louder message, below.
      if (many && built.palettes.Value[pi] && built.palettes.Value[pi].swatches.length === 0) {
        msgs.push('"' + label + '" has no usable colors, so that whole palette will be skipped.');
      }
    });
    const empty = built.palette
      ? built.palette.Value.length === 0
      : built.palettes.Value.every(function (/** @type {any} */ p) { return p.swatches.length === 0; });
    if (empty) msgs.push("There are no usable colors yet, so this policy would publish nothing.");
    if (lockedEl.checked && empty) {
      msgs.push("Enforcing with no colors does nothing at all: the setting is ignored without a palette.");
    }
    return msgs;
  }

  /**
   * Repaint the header chip from the colours currently in the payload.
   *
   * Shows EVERY usable colour rather than the leading few the toolbar icon
   * shows: at 16px an icon has to summarise, and here the whole point is seeing
   * the set. In several-palettes mode it previews the FIRST palette, because
   * that is the one staff start on - and says so, since otherwise an admin
   * editing palette two would reasonably read the chip as theirs.
   */
  function paintPreview() {
    const el = /** @type {HTMLElement} */ (document.getElementById("preview"));
    const note = /** @type {HTMLElement} */ (document.getElementById("preview-note"));
    const many = mode() === "many";
    const built = buildPolicy();
    const colors = many
      ? ((built.palettes.Value[0] || {}).swatches || [])
      : built.palette.Value;
    const hexes = colors.map(function (/** @type {any} */ c) { return c.hex; });

    if (hexes.length === 0) {
      el.style.background = "";            // back to the packaged gradient
      el.setAttribute("aria-label", "No usable brand colors yet");
      note.textContent = "";
      return;
    }
    const stops = hexes.length === 1 ? hexes[0] : "linear-gradient(90deg, " + hexes.map(function (/** @type {any} */ hex, /** @type {number} */ i) {
      return hex + " " + ((i * 100) / hexes.length).toFixed(4) + "% "
        + (((i + 1) * 100) / hexes.length).toFixed(4) + "%";
    }).join(", ") + ")";
    el.style.background = stops;
    el.setAttribute("aria-label", "Preview: " + hexes.join(", "));
    note.textContent = many
      ? 'Preview of "' + ((built.palettes.Value[0] || {}).name || "the first palette")
        + '" — the palette staff start on.'
      : "";
  }

  function refreshOutput() {
    out.textContent = JSON.stringify(buildPolicy(), null, 2);
    const msgs = listProblems();
    problems.textContent = msgs.join(" ");
    problems.className = msgs.length ? "note warn" : "note";
    paintPreview();
  }

  // ---- Start from the admin's own palettes ------------------------------------

  /** True when this page can read the extension's storage: opened as an extension page, not from a file. */
  function canReadPalettes() {
    try {
      const c = /** @type {any} */ (globalThis).chrome;
      return !!(c && c.storage && c.storage.sync && typeof c.storage.sync.get === "function")
        && !!(deps && typeof deps.getPaletteState === "function");
    } catch (_e) {
      return false;
    }
  }

  /**
   * Replace the working set with every palette stored in this browser. Reads,
   * never writes: nothing here can change the admin's own palettes.
   *
   * The caps clamp and SAY so. Real data cannot exceed them today, since
   * lib/palette.js normalizes to the same limits, but the caps are pinned by a
   * test rather than by trust, and a silent truncation is the failure mode
   * this page exists to prevent.
   */
  async function importPalettes() {
    importBtn.disabled = true;
    try {
      const state = await /** @type {any} */ (deps).getPaletteState();
      const list = Array.isArray(state && state.palettes) ? state.palettes : [];
      if (list.length === 0) {
        importNote.textContent = "There are no palettes in this browser to start from yet.";
        importNote.className = "note warn";
        return;
      }
      /** @type {string[]} */
      const notes = [];
      if (list.length > MAX_PALETTES) {
        notes.push("Only the first " + MAX_PALETTES + " of your " + list.length + " palettes were brought in.");
      }
      palettes = list.slice(0, MAX_PALETTES).map(function (/** @type {any} */ p, /** @type {number} */ i) {
        const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Palette " + (i + 1);
        const sw = Array.isArray(p.swatches) ? p.swatches : [];
        if (sw.length > MAX_SWATCHES) {
          notes.push('"' + name + '" has ' + sw.length + " colors; only the first " + MAX_SWATCHES + " were brought in.");
        }
        return {
          name: name,
          swatches: sw.slice(0, MAX_SWATCHES).map(function (/** @type {any} */ s) {
            return { name: String(s && s.name != null ? s.name : ""), hex: String(s && s.hex != null ? s.hex : "") };
          }),
        };
      });
      // Several palettes only fit the several-palettes payload; one keeps
      // whatever the admin had chosen.
      if (palettes.length > 1) setMode("many");
      importNote.textContent = notes.length
        ? notes.join(" ")
        : "Brought in " + palettes.length + (palettes.length === 1 ? " palette" : " palettes")
          + " from this browser. Edit freely here; your own palettes are not changed.";
      importNote.className = notes.length ? "note warn" : "note";
      render();
    } catch (_e) {
      importNote.textContent = "Your palettes could not be read. You can still build the policy by hand below.";
      importNote.className = "note warn";
    } finally {
      importBtn.disabled = false;
    }
  }

  /**
   * Try to load the shared editor and the storage reader. Each on its own: the
   * editor is useful without storage (a checkout served over http), and
   * neither is available from file://. Absence is the normal, silent case.
   *
   * `__policyBuilderDeps` is a TEST SEAM: jsdom cannot perform a dynamic
   * import, so the test injects the real modules through it before the script
   * runs. Nothing else sets it.
   */
  async function loadDeps() {
    const seeded = /** @type {any} */ (globalThis).__policyBuilderDeps;
    if (seeded) return seeded;
    /** @type {{ mountPaletteEditor?: Function, getPaletteState?: Function }} */
    const found = {};
    try {
      const editor = await import("../shared/palette-editor.js");
      if (typeof editor.mountPaletteEditor === "function") found.mountPaletteEditor = editor.mountPaletteEditor;
    } catch (_e) { /* file://, or the shared folder is not beside this page */ }
    try {
      const storage = await import("../lib/storage.js");
      if (typeof storage.getPaletteState === "function") found.getPaletteState = storage.getPaletteState;
    } catch (_e) { /* same */ }
    return Object.keys(found).length ? found : null;
  }

  /** @type {HTMLElement} */ (document.getElementById("copy")).addEventListener("click", function (/** @type {any} */ e) {
    const btn = e.currentTarget;
    const text = out.textContent;
    /** @param {boolean} ok */
    function done(ok) {
      btn.textContent = ok ? "Copied" : "Press Ctrl or Cmd + C";
      setTimeout(function () { btn.textContent = "Copy"; }, 2000);
    }
    // A page opened from a file:// path has no clipboard permission in some
    // browsers, so selecting the text is the fallback rather than a dead end.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { selectOutput(); done(false); });
    } else {
      selectOutput();
      done(false);
    }
  });

  function selectOutput() {
    const range = document.createRange();
    range.selectNodeContents(out);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (r) {
    r.addEventListener("change", render);
  });
  lockedEl.addEventListener("change", refreshOutput);
  addPaletteBtn.addEventListener("click", function () {
    if (palettes.length >= MAX_PALETTES) return;
    palettes.push({ name: "Palette " + (palettes.length + 1), swatches: [{ name: "New color", hex: "#1A73E8" }] });
    render();
  });
  importBtn.addEventListener("click", function () { importPalettes(); });

  // Self-contained first, so a mailed copy is usable at once and never waits
  // on an import that will not arrive; then upgrade in place when it does.
  render();
  /** Resolves once the runtime import has been tried, whichever way it went. Awaited by tests and the page smoke. */
  /** @type {any} */ (globalThis).policyBuilderReady = loadDeps().then(function (found) {
    deps = found;
    if (canReadPalettes()) importBox.hidden = false;
    if (deps && typeof deps.mountPaletteEditor === "function") render();
    return { sharedEditor: !!(deps && deps.mountPaletteEditor), importAvailable: canReadPalettes() };
  });
})();
