#!/usr/bin/env bash
# Refresh the public mirror (jimbottle/workspace-custom-palette-public) from a
# release tag of this private repo.
#
# The public repo is a production snapshot: it moves only when a version is
# released, one squashed commit per release, tagged vX.Y.Z. Day-to-day work
# stays here. Private history is never published because it still contains a
# real organization's domain and the old .beads/ export (roborev 6449; owner
# decision 2026-11-05, bd workspace-custom-palette-0mg).
#
# Usage:
#   bash dev/publish-public.sh            # build + check + commit locally, no push
#   bash dev/publish-public.sh --push     # same, then push main and the tag
#   bash dev/publish-public.sh v0.2.3     # a specific tag (default: the newest vX.Y.Z tag)
#
# The tag is the one scripts/release.sh X.Y.Z creates on the release commit.
# Run this after the Chrome Web Store has accepted that version.
#
# The snapshot leaves out PRIVATE_PATHS (below): .github/ and the agent
# workflow files (CLAUDE.md, AGENTS.md, .claude/, docs/HANDOFF.md).
#
# Checks (any failure stops before anything is committed):
#   1. The ref is a tag named v<manifest version at that tag>.
#   2. The version is released at the tag: CHANGELOG.md has a dated
#      "## [X.Y.Z]" heading (scripts/release.sh writes one), or
#      RELEASE_NOTES.md has a heading for it (the convention before
#      release.sh). No released heading in either, or a RELEASE_NOTES.md
#      heading saying Unreleased, refuses.
#   3. The public repo does not already have the tag.
#   4. Scrub: no line of the denylist appears in the snapshot. The denylist
#      lives OUTSIDE the repo (default ~/.config/raylytics/wcp-public-scrub.txt,
#      override with WCP_PUBLIC_SCRUB), because the strings it guards must not
#      be committed here either. A missing denylist is a failure, not a skip.
#   5. No .beads/, .env, op.env or Dolt data in the snapshot.
#   6. gitleaks finds nothing, using the tag's own .gitleaks.toml (which
#      allowlists manifest.json's "key", the public key that pins the
#      extension ID). A tag without that file falls back to allowing only
#      that one finding.
#
# Pushing is a publish to a public GitHub repo: run --push only with the
# owner's go-ahead.
set -euo pipefail

PUBLIC_REMOTE="${WCP_PUBLIC_REMOTE:-git@github.com:jimbottle/workspace-custom-palette-public.git}"
SCRUB_FILE="${WCP_PUBLIC_SCRUB:-$HOME/.config/raylytics/wcp-public-scrub.txt}"
# Paths kept out of the public snapshot (owner, 2026-11-05: keep repo
# plumbing and the agent workflow private). .github holds CI and release.yml,
# which would create a GitHub Release on the public repo for every tag; the
# rest are agent instructions, agent settings and a session handoff.
PRIVATE_PATHS=(.github .claude CLAUDE.md AGENTS.md docs/HANDOFF.md)
AUTHOR_NAME="jimbottle"
AUTHOR_EMAIL="39418499+jimbottle@users.noreply.github.com"

push=0
ref=""
for arg in "$@"; do
  case "$arg" in
    --push) push=1 ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d'; exit 0 ;;
    *) ref="$arg" ;;
  esac
done

die() { echo "publish-public: $*" >&2; exit 1; }

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [ -z "$ref" ]; then
  # The newest release tag, not v<manifest version>: the manifest is bumped
  # in the first commit after a release, so during store review it already
  # names a version that has no tag yet.
  ref="$(git tag --list 'v[0-9]*' --sort=-v:refname | head -n 1)"
  [ -n "$ref" ] || die "no vX.Y.Z tags in this repo"
fi
git rev-parse -q --verify "refs/tags/$ref" >/dev/null || die "no tag $ref (tag the release first)"
ver="$(git show "$ref:manifest.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).version))')"
[ "$ref" = "v$ver" ] || die "tag $ref does not match manifest version $ver at that tag"

# The heading lines for exactly $ver ("## [0.2.3] - date", "## 0.2.3"), so
# a missing heading is caught and 0.2.3 never matches 0.2.30 (roborev 6992).
# A file missing at the tag yields no headings (the "no released heading"
# check below then names the gap) instead of a silent set -e exit.
headings() {
  git cat-file -e "$ref:$1" 2>/dev/null || return 0
  git show "$ref:$1" \
    | awk -v v="$ver" '/^#+ / { t = $2; gsub(/[][]/, "", t); if (t == v) print }'
}
cl="$(headings CHANGELOG.md)"
rn="$(headings RELEASE_NOTES.md)"
# An Unreleased marker in either file refuses the tag, whatever the other says.
if grep -qi "unreleased" <<<"$cl"; then
  die "CHANGELOG.md at $ref still marks $ver as Unreleased"
fi
if grep -qi "unreleased" <<<"$rn"; then
  die "RELEASE_NOTES.md at $ref still marks $ver as Unreleased"
fi
# A changelog heading counts when it is dated; failing that, a
# RELEASE_NOTES.md heading for the version (the older convention, before
# scripts/release.sh dated the changelog). Note: the existing v0.2.2
# tag sits on the first commit of the 0.2.2 cycle, where both files still
# say unreleased, so this check (like the one before it) refuses it.
cl_released=0
if [ -n "$cl" ] && grep -qE '[0-9]{4}-[0-9]{2}-[0-9]{2}' <<<"$cl"; then
  cl_released=1
fi
[ "$cl_released" = 1 ] || [ -n "$rn" ] \
  || die "$ver has no released heading at $ref: neither a dated \"## [$ver]\" in CHANGELOG.md nor a RELEASE_NOTES.md heading"

[ -r "$SCRUB_FILE" ] || die "scrub denylist not found at $SCRUB_FILE (see header)"
command -v gitleaks >/dev/null || die "gitleaks is not installed"

if git ls-remote --exit-code --tags "$PUBLIC_REMOTE" "refs/tags/$ref" >/dev/null 2>&1; then
  die "public repo already has $ref"
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/wcp-public.XXXXXX")"
echo "publish-public: working in $work"
mkdir "$work/tree"
git archive "$ref" | tar -x -C "$work/tree"
for p in "${PRIVATE_PATHS[@]}"; do rm -rf "${work:?}/tree/$p"; done

# 4. scrub
patterns="$work/patterns.txt"
grep -v '^[[:space:]]*#' "$SCRUB_FILE" | grep -v '^[[:space:]]*$' > "$patterns" || true
[ -s "$patterns" ] || die "scrub denylist $SCRUB_FILE has no patterns"
# Binary files are scanned too (no -I: an image or fixture can carry a
# string), and only grep's own "no match" (exit 1) counts as clean: an
# unreadable file (exit 2) fails the check instead of passing it
# (roborev 6992).
scrub_rc=0
hits="$(grep -rilaF -f "$patterns" "$work/tree")" || scrub_rc=$?
case "$scrub_rc" in
  0) echo "${hits//$work\/tree\//}" >&2
     die "scrub denylist matched the files above (pattern values not printed)" ;;
  1) ;;
  *) die "scrub could not complete (grep exit $scrub_rc); refusing to call the snapshot clean" ;;
esac

# 5. local-only data
for bad in .beads .dolt .env op.env .beads-credential-key; do
  [ ! -e "$work/tree/$bad" ] || die "snapshot contains $bad"
done

# 6. gitleaks
gl_config=()
[ -f "$work/tree/.gitleaks.toml" ] && gl_config=(--config "$work/tree/.gitleaks.toml")
# --log-level error: the expected manifest-key finding would otherwise print
# "leaks found: 1" on a clean run (roborev 6995); real errors still show.
gitleaks dir "$work/tree" "${gl_config[@]}" --no-banner --redact --exit-code 0 --log-level error \
  --report-format json --report-path "$work/gitleaks.json" >/dev/null \
  || die "gitleaks failed to run (see its error above)"
unexpected="$(node -e '
  const r = require(process.argv[1]);
  // --redact turns the match into: key": "REDACTED"
  const isManifestKey = f => f.File.endsWith("/tree/manifest.json") &&
    f.RuleID === "generic-api-key" && /^"?key"/.test(f.Match || "");
  const bad = r.filter(f => !isManifestKey(f));
  for (const f of bad) console.log(f.File.split("/tree/")[1] + ":" + f.StartLine + " " + f.RuleID);
' "$work/gitleaks.json")"
[ -z "$unexpected" ] || { echo "$unexpected" >&2; die "gitleaks findings above"; }

# Build the release commit on top of the public main.
git clone -q "$PUBLIC_REMOTE" "$work/public"
find "$work/public" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$work/tree/." "$work/public/"
cd "$work/public"
git add -A --force
if git diff --cached --quiet; then
  die "snapshot of $ref is identical to public main; nothing to release"
fi
export GIT_AUTHOR_NAME="$AUTHOR_NAME" GIT_AUTHOR_EMAIL="$AUTHOR_EMAIL"
export GIT_COMMITTER_NAME="$AUTHOR_NAME" GIT_COMMITTER_EMAIL="$AUTHOR_EMAIL"
git commit -q -m "Release $ver" -m "Snapshot of the $ref release. Changes are listed in CHANGELOG.md."
git tag -a "$ref" -m "Release $ver"   # annotated: tag.gpgsign turns any tag into a signed one
git --no-pager show --stat --format='%h %an <%ae> %s' HEAD | tail -n 5

if [ "$push" -eq 1 ]; then
  git push -q origin HEAD:main "refs/tags/$ref"
  echo "publish-public: pushed $ref to $PUBLIC_REMOTE"
else
  echo "publish-public: checks passed; commit is ready in $work/public (not pushed)."
  echo "publish-public: rerun with --push, or: git -C $work/public push origin HEAD:main refs/tags/$ref"
fi
