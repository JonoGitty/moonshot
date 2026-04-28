#!/usr/bin/env bash
# release.sh — cut a new MOONSHOT release.
#
# Usage:
#   bash scripts/release.sh patch    # 0.5.0 → 0.5.1
#   bash scripts/release.sh minor    # 0.5.0 → 0.6.0
#   bash scripts/release.sh major    # 0.5.0 → 1.0.0
#   bash scripts/release.sh 0.7.3    # explicit version
#
# Steps:
#   1. Confirm working tree is clean (warn if not).
#   2. Run regression test (gate — abort if any ship fails).
#   3. Bump package.json version.
#   4. Print suggested CHANGELOG block — caller edits + commits manually.
#   5. Create annotated git tag.
#   6. Print push instructions (do NOT push automatically — human gate).

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# --- 1. working tree clean check ---------------------------------------------
if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠  Working tree is not clean. Stage + commit your changes before release."
  echo "   (release.sh will not silently include uncommitted work.)"
  git status --short
  exit 1
fi

# --- 2. regression gate -------------------------------------------------------
echo "▶  Running regression test (autopilot, all ships)…"
if ! pgrep -f "http.server 8080" >/dev/null 2>&1; then
  echo "ℹ  Starting local HTTP server on :8080 for the test."
  python3 -m http.server 8080 > /tmp/moonshot-release-srv.log 2>&1 &
  SRV_PID=$!
  trap "kill $SRV_PID 2>/dev/null || true" EXIT
  sleep 1
fi
if ! node test-autofly-all.mjs; then
  echo "❌  Regression failed. Release aborted."
  exit 1
fi
echo "✅  Regression green."

# --- 3. version bump ----------------------------------------------------------
CUR=$(node -p "require('./package.json').version")
BUMP=${1:-patch}
case "$BUMP" in
  patch|minor|major)
    NEW=$(node -e "
      const v = require('./package.json').version.split('.').map(Number);
      const k = '$BUMP';
      if (k === 'major') { v[0]++; v[1]=0; v[2]=0; }
      else if (k === 'minor') { v[1]++; v[2]=0; }
      else { v[2]++; }
      console.log(v.join('.'));
    ")
    ;;
  *)
    if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      NEW="$BUMP"
    else
      echo "Unknown bump: $BUMP (expected patch|minor|major|X.Y.Z)"
      exit 1
    fi
    ;;
esac

echo "▶  Bumping $CUR → $NEW"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
  pkg.version = '$NEW';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# --- 4. CHANGELOG nudge -------------------------------------------------------
DATE=$(date +%Y-%m-%d)
echo
echo "📝  Add this section to CHANGELOG.md (under [Unreleased]):"
echo
cat <<EOF
## [$NEW] — $DATE
<short summary>

### Added / Changed / Fixed
- ...

EOF
echo "Then update the link footer:"
echo "  [Unreleased]: …compare/v$NEW...HEAD"
echo "  [$NEW]:      …compare/v$CUR...v$NEW"
echo
read -p "Press Enter once CHANGELOG is updated and committed (or Ctrl-C to abort)… "

# --- 5. tag -------------------------------------------------------------------
if git rev-parse "v$NEW" >/dev/null 2>&1; then
  echo "❌  Tag v$NEW already exists."
  exit 1
fi
git tag -a "v$NEW" -m "MOONSHOT v$NEW"
echo "✅  Tagged v$NEW."

# --- 6. push instructions -----------------------------------------------------
echo
echo "🚀  To publish:"
echo "    git push origin main --follow-tags"
