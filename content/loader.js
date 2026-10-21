/*
 * loader — the classic (non-module) content script named in the manifest.
 * MV3 content scripts can't be ES modules directly, so this bootstraps the real
 * ESM entry via dynamic import of a web-accessible resource. Keep this file
 * dependency-free and tiny; all logic lives in bootstrap.js and beyond.
 */
(() => {
  const url = chrome.runtime.getURL("content/bootstrap.js");
  import(url).catch((err) => console.error("[brand-palette] failed to load bootstrap", err));
})();
