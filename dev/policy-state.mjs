/**
 * Read what the extension ACTUALLY received and what it did with it, straight
 * out of a live Chrome profile — no browser driving, no clicking.
 *
 * This is the agent-side half of the C–F walkthrough (bd
 * workspace-custom-palette-0dj). A human still does the Admin console, because
 * proving real cloud delivery is the entire point of those sections. After each
 * console Save, this answers the three questions that otherwise cost a round of
 * screenshots:
 *
 *   1. did the policy arrive, and is it the payload you think you pasted?
 *   2. what did the extension store in response — pointer, push memory, palettes?
 *   3. therefore, what SHOULD the pickers be showing right now?
 *
 * (3) is the one that turns "does this look right?" into a checkable claim: it
 * runs the real resolver from lib/palette.js over the real stored state, so the
 * expected hexes come from the shipping decision logic rather than from a guess.
 *
 * Reads only; never writes to the profile. Chrome may hold the LevelDB files
 * open, which is fine — this scrapes the on-disk records rather than opening
 * the database, so it works while Chrome is running and cannot corrupt it.
 *
 *   node dev/policy-state.mjs                  # auto-detect the profile
 *   node dev/policy-state.mjs "Profile 12"     # a specific one
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { resolveEffectivePalette, normalizePalette } from "../lib/palette.js";
import { orgPalettes, orgSwatches } from "../lib/config.js";

const EXT_ID = "hchpnnppgakgmobkbldgkohmplkcahjl";
const CHROME = path.join(os.homedir(), "Library/Application Support/Google/Chrome");

/**
 * The keys worth extracting, LONGEST FIRST.
 *
 * Order is load-bearing and is the whole reason this is a named constant with a
 * test. JS alternation is leftmost-first, not longest-match: with `palette`
 * listed before `paletteLocked`, every occurrence of `paletteLocked` matched the
 * shorter `palette` and stopped, so this tool could never once report that a
 * policy was enforced — while cheerfully printing "enforced: no" (roborev 4185).
 * That is the single fact D1, D5 and F1 exist to check, so the tool was at its
 * least trustworthy exactly where it was most needed.
 *
 * Any key that is a prefix of another MUST come after it.
 */
export const SCAN_KEYS = [
  "paletteLocked", "paletteOrder", "activePaletteId", "orgDefaultPushed",
  "enforcementPushed", "multiPalette", "palettes", "palette", "theme", "enabled",
];

/** @returns {RegExp} a fresh matcher; callers mutate lastIndex via matchAll. */
export function scanPattern() {
  return new RegExp(`(${SCAN_KEYS.join("|")}|pal:[a-z0-9]+)`, "g");
}

/**
 * LevelDB files in WRITE ORDER, oldest first.
 *
 * readdirSync gives no chronological guarantee (roborev 4185) and the scrape
 * lets later records win, so an unsorted walk could let a stale compacted value
 * overwrite a newer one — the exact failure that makes a "what is stored right
 * now" tool worse than useless. `.ldb` files are compacted history and `.log` is
 * the live write-ahead log, so every `.ldb` precedes every `.log`; within each,
 * leveldb's ascending file numbers are the write order.
 * @param {string[]} files @returns {string[]}
 */
export function orderByWrite(files) {
  const num = (f) => Number((f.match(/(\d+)/) ?? [])[1] ?? 0);
  return files
    .filter((f) => /\.(log|ldb)$/.test(f))
    .sort((a, b) => (a.endsWith(".log") ? 1 : 0) - (b.endsWith(".log") ? 1 : 0) || num(a) - num(b));
}

/**
 * Pull `key` -> JSON value pairs out of one store's raw record bytes.
 * @param {string} raw @returns {Record<string, unknown>}
 */
export function scanRecords(raw) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const m of raw.matchAll(scanPattern())) {
    const key = m[0];
    const value = firstJsonValue(raw.slice((m.index ?? 0) + key.length));
    if (value !== undefined) out[key] = value; // later records win, as in leveldb
  }
  return out;
}

/**
 * Pull `key` -> JSON value pairs out of a LevelDB store.
 *
 * Deliberately a scrape, not a parser. The values we care about are JSON that
 * leveldb stores verbatim, so finding a known key and reading the balanced JSON
 * that follows it is both simpler and more robust across leveldb versions than
 * decoding the record framing — and it cannot write, which matters when Chrome
 * has the file open.
 * @param {string} dir @returns {Record<string, unknown>}
 */
function readStore(dir) {
  /** @type {Record<string, unknown>} */
  const out = {};
  let files;
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const f of orderByWrite(files)) {
    let raw;
    try { raw = fs.readFileSync(path.join(dir, f), "latin1"); } catch { continue; }
    Object.assign(out, scanRecords(raw));
  }
  return out;
}

/** The first complete JSON value at the head of `s`, or undefined. */
export function firstJsonValue(s) {
  const start = s.search(/[[{"tfn\d-]/);
  if (start < 0 || start > 4) return undefined; // the value follows the key closely
  const body = s.slice(start);
  for (const lit of ["true", "false", "null"]) {
    if (body.startsWith(lit)) return JSON.parse(lit);
  }
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < Math.min(body.length, 200000); i++) {
    const c = body[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; if (!inStr && depth === 0) { try { return JSON.parse(body.slice(0, i + 1)); } catch { return undefined; } } continue; }
    if (inStr) continue;
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) { try { return JSON.parse(body.slice(0, i + 1)); } catch { return undefined; } }
    }
  }
  return undefined;
}

function findProfile(explicit) {
  if (explicit) return explicit;
  let best = null;
  for (const d of fs.readdirSync(CHROME)) {
    if (!/^(Default|Profile \d+)$/.test(d)) continue;
    if (fs.existsSync(path.join(CHROME, d, "Managed Extension Settings", EXT_ID))
      || fs.existsSync(path.join(CHROME, d, "Sync Extension Settings", EXT_ID))) best = best ?? d;
  }
  return best;
}

// Only when run as a script. Guarded so the pure helpers above can be imported
// by tests without this reading the user's Chrome profile and printing to stdout
// as an import side effect.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const profile = findProfile(process.argv[2]);
  if (!profile) {
    console.error(`No Chrome profile found carrying ${EXT_ID}. Pass one explicitly, e.g. "Profile 12".`);
    process.exit(2);
  }
  const base = path.join(CHROME, profile);
  const managed = readStore(path.join(base, "Managed Extension Settings", EXT_ID));
  const sync = readStore(path.join(base, "Sync Extension Settings", EXT_ID));

  console.log(`profile: ${profile}\n`);

  console.log("1. POLICY DELIVERED (chrome.storage.managed)");
  const policyKeys = ["palette", "palettes", "paletteLocked"].filter((k) => k in managed);
  if (policyKeys.length === 0) {
    console.log("   nothing — no policy is reaching this extension");
  } else {
    for (const k of policyKeys) console.log(`   ${k} = ${JSON.stringify(managed[k])}`);
  }

  console.log("\n2. WHAT THE EXTENSION STORED (chrome.storage.sync)");
  const stateKeys = ["activePaletteId", "orgDefaultPushed", "enforcementPushed", "multiPalette", "paletteOrder"];
  for (const k of stateKeys) if (k in sync) console.log(`   ${k} = ${JSON.stringify(sync[k])}`);
  const own = Object.keys(sync).filter((k) => k.startsWith("pal:"));
  for (const k of own) {
    const v = /** @type {any} */ (sync[k]);
    console.log(`   ${k} = ${JSON.stringify(v?.name)} (${normalizePalette(v?.swatches).length} colors)`);
  }
  if (!own.length && !stateKeys.some((k) => k in sync)) console.log("   nothing stored — a fresh install");

  console.log("\n3. THEREFORE THE PICKERS SHOULD SHOW");
  const policy = { palette: managed.palette, palettes: managed.palettes };
  const locked = managed.paletteLocked === true;
  const activePaletteId = sync.activePaletteId;
  const userSwatches = (() => {
    const id = activePaletteId;
    const entry = own.map((k) => ({ k, v: /** @type {any} */ (sync[k]) }))
      .find(({ k }) => k === `pal:${id}`) ?? (own.length ? { k: own[0], v: /** @type {any} */ (sync[own[0]]) } : null);
    return entry ? normalizePalette(entry.v?.swatches) : [];
  })();
  const effective = resolveEffectivePalette({
    user: userSwatches,
    managed: orgSwatches(policy, activePaletteId),
    defaults: JSON.parse(fs.readFileSync(new URL("../config/palette.default.json", import.meta.url), "utf8")).swatches,
    locked,
    activePaletteId,
  });
  for (const s of effective) console.log(`   ${s.hex}  ${s.name}`);
  const orgs = orgPalettes(policy);
  if (orgs.length) {
    console.log(`\n   organization published ${orgs.length} palette(s): ${orgs.map((o) => o.name).join(", ")}`);
    console.log(`   enforced: ${locked ? "YES — the org palette is read-only" : "no — it is a starting point"}`);
  }
}
