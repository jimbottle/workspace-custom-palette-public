#!/usr/bin/env bash
#
# Set (or clear) a LOCAL enterprise policy for the unpacked extension, so the
# managed-palette walkthrough in docs/TEST_PLAN.md can run without a managed
# fleet. macOS only.
#
# Usage:  sudo dev/test-policy.sh <mode> [extension-id]
#
# Modes, matched to the walkthrough steps:
#   unlocked      palette only                       (step 3)
#   locked        palette + paletteLocked            (steps 4, 4b)
#   multi         several named palettes, unlocked   (step 2b)
#   locked-multi  several named palettes, enforced
#   lock-only     paletteLocked with NO palette      (step 7)
#   degenerate    empty palette + invalid entries    (step 7)
#   none          remove the policy                  (steps 5, 8)
#
# HOW THIS WORKS, because the first version of this recipe got it wrong: on
# macOS Chrome reads per-extension managed storage from its own preference
# domain, /Library/Managed Preferences/com.google.Chrome.extensions.<ID>.plist,
# with the policy keys at the TOP LEVEL of that file. It is NOT delivered via
# ExtensionSettings in com.google.Chrome.plist (that is a Windows/Linux
# concept), and this script deliberately never touches com.google.Chrome.plist,
# which may hold unrelated machine policy.
set -euo pipefail

MODE="${1:-}"
[ -z "$MODE" ] && { grep '^#' "$0" | sed 's/^# \{0,1\}//' | sed -n '2,20p'; exit 64; }
[ "$(id -u)" -eq 0 ] || { echo "run with sudo (writes /Library/Managed Preferences)"; exit 77; }

# The unpacked extension's id, from Chrome's own profile data. Under sudo,
# $HOME is root's, so look in the invoking user's.
EXTID="${2:-}"
if [ -z "$EXTID" ]; then
  USER_HOME=$(dscl . -read "/Users/${SUDO_USER:-$USER}" NFSHomeDirectory | awk '{print $2}')
  EXTID=$(python3 - "$USER_HOME" <<'PY'
import glob, json, sys
for pref in glob.glob(sys.argv[1] + "/Library/Application Support/Google/Chrome/*/Secure Preferences"):
    try: d = json.load(open(pref))
    except Exception: continue
    for eid, meta in (d.get("extensions", {}).get("settings", {}) or {}).items():
        if "workspace-custom-palette" in str(meta.get("path", "")):
            print(eid); sys.exit()
PY
)
  [ -z "$EXTID" ] && { echo "could not auto-detect the extension id; pass it as the second argument (chrome://extensions)"; exit 65; }
fi
echo "extension id: $EXTID"

PLIST="/Library/Managed Preferences/com.google.Chrome.extensions.${EXTID}.plist"

if [ "$MODE" = "none" ]; then
  rm -f "$PLIST"
  killall cfprefsd 2>/dev/null || true
  # Prove OUR artifact is gone, scoped to our exact path - a generic
  # `ls | grep extensions` false-alarms on machines where an MDM legitimately
  # manages OTHER extensions (review 4069).
  if [ -e "$PLIST" ]; then
    echo "FAILED to remove: $PLIST"; exit 1
  fi
  echo "CLEAN: $PLIST removed. chrome://policy -> Reload policies (quit and reopen Chrome if it lingers)."
  exit 0
fi

PALETTE='<key>palette</key><array>
  <dict><key>name</key><string>Org Blue</string><key>hex</key><string>#1A73E8</string></dict>
  <dict><key>name</key><string>Org Green</string><key>hex</key><string>#34A853</string></dict>
</array>'
PALETTES='<key>palettes</key><array>
  <dict><key>name</key><string>Retail</string><key>swatches</key><array>
    <dict><key>name</key><string>Poppy</string><key>hex</key><string>#FE5917</string></dict>
    <dict><key>name</key><string>Sunshine</string><key>hex</key><string>#EABF26</string></dict>
  </array></dict>
  <dict><key>name</key><string>Wholesale</string><key>swatches</key><array>
    <dict><key>name</key><string>Grass</string><key>hex</key><string>#385834</string></dict>
    <dict><key>name</key><string>Night</string><key>hex</key><string>#1A2D27</string></dict>
  </array></dict>
</array>'
LOCK='<key>paletteLocked</key><true/>'

case "$MODE" in
  unlocked)     BODY="$PALETTE" ;;
  locked)       BODY="$PALETTE$LOCK" ;;
  multi)        BODY="$PALETTES" ;;
  locked-multi) BODY="$PALETTES$LOCK" ;;
  lock-only)    BODY="$LOCK" ;;
  degenerate)   BODY='<key>palette</key><array>
  <dict><key>name</key><string></string><key>hex</key><string>#123456</string></dict>
  <dict><key>name</key><string>BadHex</string><key>hex</key><string>notacolor</string></dict>
</array>' ;;
  *) echo "unknown mode: $MODE"; exit 64 ;;
esac

TMP=$(mktemp /tmp/ccp-policy.XXXXXX.plist)
cat > "$TMP" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
$BODY
</dict></plist>
EOF
plutil -lint "$TMP" >/dev/null   # a typo here should fail HERE, not silently in Chrome
# Binary, root-owned, world-readable: the shape cfprefsd reliably honours.
plutil -convert binary1 -o "$PLIST" "$TMP"
chown root:wheel "$PLIST"; chmod 644 "$PLIST"
rm -f "$TMP"
killall cfprefsd 2>/dev/null || true

echo "wrote: $PLIST"
echo "verify: sudo plutil -p '$PLIST'"
echo "then: chrome://policy -> Reload policies. If the values do not appear,"
echo "quit Chrome fully (Cmd+Q) and reopen - Reload alone sometimes lags cfprefsd."
