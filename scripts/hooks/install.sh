#!/usr/bin/env bash
# Install the project's Tier-1 pre-commit gate (typecheck + unit tests).
# Idempotent.
#
# This repo uses beads, which sets core.hooksPath to .beads/hooks — so the usual
# "symlink into .git/hooks" trick is bypassed by git. We therefore COMPOSE with
# beads: chain our tracked scripts/hooks/pre-commit from the active hooks dir's
# pre-commit, in a guarded block beads won't touch (it only rewrites between its
# own BEGIN/END BEADS INTEGRATION markers).
#
# If core.hooksPath is NOT set (no beads), we fall back to symlinking into
# .git/hooks and refuse to clobber an existing non-symlink hook.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
src="scripts/hooks/pre-commit"
chmod +x "$root/$src"

hooks_path="$(git config --get core.hooksPath || true)"

if [ -n "$hooks_path" ]; then
  # Resolve relative hooksPath against repo root.
  case "$hooks_path" in /*) dir="$hooks_path";; *) dir="$root/$hooks_path";; esac
  target="$dir/pre-commit"
  mkdir -p "$dir"
  marker="BRAND-PALETTE TIER-1"
  if [ -f "$target" ] && grep -q "$marker" "$target"; then
    echo "Tier-1 chain already present in $target"
    exit 0
  fi
  {
    [ -f "$target" ] || printf '#!/usr/bin/env sh\n'
    cat <<'EOF'

# --- BEGIN BRAND-PALETTE TIER-1 (managed by scripts/hooks/install.sh) ---
_bp_hook="$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit"
if [ -x "$_bp_hook" ]; then "$_bp_hook" "$@" || exit $?; fi
# --- END BRAND-PALETTE TIER-1 ---
EOF
  } >> "$target"
  chmod +x "$target"
  echo "chained Tier-1 gate into $target (core.hooksPath=$hooks_path)"
else
  dest="$root/.git/hooks/pre-commit"
  if [ -e "$dest" ] && [ ! -L "$dest" ]; then
    echo "refusing to overwrite existing non-symlink hook at $dest" >&2
    exit 1
  fi
  ln -sf "../../$src" "$dest"
  echo "installed pre-commit hook: $dest -> $src"
fi
