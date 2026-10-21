#!/usr/bin/env bash
# Build a Chrome Web Store-ready zip into dist/ (gitignored). The extension lives
# at the repo root (manifest.json + the code dirs), matching the other Raylytics
# extensions. Whitelists only the runtime files and explicitly excludes dev-only
# files (background/dev-reload.js, __tests__) and .DS_Store so they can never leak.
set -euo pipefail

cd "$(dirname "$0")/.."

# ---- MANDATORY in-browser release gate (docs/TEST_PLAN.md) ------------------
# 0.1.4 shipped with the Brand row unlabeled in Docs because no one opened the
# three editors before packaging. A distribution zip may only be built after the
# in-browser smoke matrix passed on the CURRENT working tree: in Docs, Sheets,
# AND Slides — Brand label visible, swatch tooltips show the brand names, and a
# brand color actually applies. Confirm with SMOKE_CHECKED=1 (after really doing
# it) or answer the prompt.
if [ "${SMOKE_CHECKED:-}" != "1" ]; then
  echo "RELEASE GATE: confirm the in-browser smoke matrix (docs/TEST_PLAN.md) passed on THIS tree:"
  echo "  Docs + Sheets + Slides: Brand label visible / tooltips correct / color applies."
  if [ ! -t 0 ]; then
    echo "Non-interactive run without SMOKE_CHECKED=1 — refusing to package." >&2
    exit 1
  fi
  printf 'Type "verified" to continue: '
  read -r answer
  if [ "$answer" != "verified" ]; then
    echo "Not confirmed — refusing to package." >&2
    exit 1
  fi
fi

# ---- Tier 1 must pass on THIS tree, at cut time -----------------------------
# Not just "the pre-commit hook ran at some point": 0.1.6 was zipped at 19:07 on
# 2026-08-15 and the fix for a known, already-reported non-English apply failure
# landed at 19:33 the same evening, so the artifact shipped 26 minutes behind
# main and the Danish reporter stayed broken through a whole release. Re-running
# the suite here ties the zip to a green tree at the moment of the cut. The
# locale/pseudo-localization tests (content/__tests__/locale-fixture.test.js)
# are part of this, which is the automated coverage 0.1.6 did not have.
echo "Running Tier 1 (typecheck + unit tests) on the current tree..."
npm run typecheck
npm test

# ---- the zip must be traceable to a commit ----------------------------------
# Diagnosing the 0.1.6 report meant unzipping the artifact to find out which
# selector contract it actually carried. Refuse to build from a dirty tree and
# stamp the commit + contract version so that question is answerable from the
# release notes instead.
packaged_paths="manifest.json icons background content config feedback lib options popup shared"
if ! git diff --quiet HEAD -- $packaged_paths; then
  echo "Working tree has uncommitted changes to packaged files — commit them first so the zip maps to a commit." >&2
  exit 1
fi
# Untracked files matter just as much: `git diff` only sees TRACKED files, but
# the zip below packages whole directories. A half-finished module sitting
# untracked under content/ or lib/ would be shipped inside an artifact stamped
# with a commit that does not contain it, which defeats the point of the stamp
# in exactly the case where the mapping is most likely to be wrong.
# Mirror the zip's own exclusions, so an untracked TEST file (never packaged)
# cannot block a cut for no reason — a gate that blocks on nothing is a gate
# people learn to bypass.
untracked=$(git ls-files --others --exclude-standard -- $packaged_paths | grep -v '__tests__/' || true)
if [ -n "$untracked" ]; then
  echo "Untracked files under packaged directories would be zipped but are in no commit:" >&2
  echo "$untracked" >&2
  echo "Commit them or remove them (add to .gitignore if they are local-only)." >&2
  exit 1
fi

version=$(node -p "require('./manifest.json').version")
contract_version=$(node -p "require('./config/selectors.default.json').version")
commit=$(git rev-parse --short HEAD)
echo "Packaging ${version} from commit ${commit} (selector contract ${contract_version})"
out="dist/custom-color-palette-${version}.zip"
mkdir -p dist
rm -f "$out"

# Zip from the repo root so manifest.json sits at the zip root. List the
# extension dirs explicitly so monitor/, service/, docs, node_modules, etc. never
# get swept in.
zip -r -q "$out" \
    manifest.json \
    icons \
    background content config feedback lib options popup shared \
    -x '*/.DS_Store' '.DS_Store' \
       'background/dev-reload.js' \
       '*/__tests__/*' \
       '*/__tests__'

echo "Wrote $out  (version ${version}, commit ${commit}, selector contract ${contract_version})"
unzip -l "$out"
echo
echo "Sanity: dev-reload.js and __tests__ must NOT appear above."
