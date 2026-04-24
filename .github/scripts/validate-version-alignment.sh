#!/usr/bin/env bash
# Validates that the TypeScript SDK's version declarations match the
# most recent released section of CHANGELOG.md. Patterned on the same
# script in axonflow-enterprise, axonflow-sdk-go, and axonflow-sdk-python.
#
# Why: the release workflow runs `npm version` / sed-rewrites package.json
# and regenerates src/version.ts at publish time but never commits the
# bump back to main, so the repo version silently lags the registry
# version between releases. This gate enforces the invariant on every PR:
#
#   package.json::version
#     == src/version.ts::VERSION
#     == most recent `## [X.Y.Z]` section in CHANGELOG.md
#
# When it's time to release, a single release-prep PR renames
# [Unreleased] → [X.Y.Z] - DATE AND bumps both manifest files in the
# same commit (regenerated via `npm run stamp-version` + `npm install`)
# so this gate always sees them together.
#
# Run locally:
#   ./.github/scripts/validate-version-alignment.sh

set -euo pipefail

ERRORS=0

# Latest RELEASED version = first `## [x.y.z]` line that isn't
# [Unreleased] (which starts with a letter, not a digit).
#
# `{ grep || true; }` is deliberate: under `set -euo pipefail`, a
# failing grep (no match) aborts the whole command substitution
# before we reach the -z check, killing the script silently. The
# wrapper lets the `-z` check produce the real user-facing error.
LATEST_VERSION=$({ grep -m1 -E '^## \[[0-9]' CHANGELOG.md || true; } | sed 's/## \[\(.*\)\].*/\1/' | sed 's/^v//')

if [ -z "${LATEST_VERSION:-}" ]; then
    echo "❌ Could not extract a released version (## [X.Y.Z]) from CHANGELOG.md"
    exit 1
fi

echo "📋 Latest CHANGELOG version: $LATEST_VERSION"
echo ""

# Check package.json::version (via python — available on all CI runners)
echo "📦 Checking package.json..."
PACKAGE_VER=$(python3 -c "import json,sys; print(json.load(open('package.json')).get('version',''))" || true)
if [ -z "${PACKAGE_VER:-}" ]; then
    echo "  ❌ package.json — could not read version"
    ERRORS=$((ERRORS + 1))
elif [ "$PACKAGE_VER" != "$LATEST_VERSION" ]; then
    echo "  ❌ package.json — version is \"$PACKAGE_VER\", expected \"$LATEST_VERSION\""
    ERRORS=$((ERRORS + 1))
else
    echo "  ✅ package.json — $PACKAGE_VER"
fi

# Check src/version.ts::VERSION
echo "🔧 Checking src/version.ts..."
VERSION_TS=$(grep -m1 -E "export const VERSION = ['\"]" src/version.ts | sed "s/.*['\"]\(.*\)['\"].*/\1/" || true)
if [ -z "${VERSION_TS:-}" ]; then
    echo "  ❌ src/version.ts — could not read VERSION"
    ERRORS=$((ERRORS + 1))
elif [ "$VERSION_TS" != "$LATEST_VERSION" ]; then
    echo "  ❌ src/version.ts — VERSION is \"$VERSION_TS\", expected \"$LATEST_VERSION\""
    ERRORS=$((ERRORS + 1))
else
    echo "  ✅ src/version.ts — $VERSION_TS"
fi

# package-lock.json carries the version in two places that npm keeps
# in sync: the top-level `version` AND the root-package entry
# `packages[""].version`. Both get rewritten by `npm install` from
# package.json. Drift between them is rare but possible (manual edits,
# partial merges, tool bugs), and either one being stale breaks
# `npm publish` / `npm ci` invariants. Validate both, independently.
echo "🔒 Checking package-lock.json..."
LOCK_TOP_VER=$(python3 -c "import json; d=json.load(open('package-lock.json')); print(d.get('version',''))" || true)
if [ -z "${LOCK_TOP_VER:-}" ]; then
    echo "  ❌ package-lock.json — could not read top-level version"
    ERRORS=$((ERRORS + 1))
elif [ "$LOCK_TOP_VER" != "$LATEST_VERSION" ]; then
    echo "  ❌ package-lock.json — top-level version is \"$LOCK_TOP_VER\", expected \"$LATEST_VERSION\""
    ERRORS=$((ERRORS + 1))
else
    echo "  ✅ package-lock.json — top-level $LOCK_TOP_VER"
fi

LOCK_ROOT_VER=$(python3 -c "import json; d=json.load(open('package-lock.json')); print(d.get('packages',{}).get('',{}).get('version',''))" || true)
if [ -z "${LOCK_ROOT_VER:-}" ]; then
    echo "  ❌ package-lock.json — could not read packages[\"\"].version (lockfile v2/v3 root entry)"
    ERRORS=$((ERRORS + 1))
elif [ "$LOCK_ROOT_VER" != "$LATEST_VERSION" ]; then
    echo "  ❌ package-lock.json — packages[\"\"].version is \"$LOCK_ROOT_VER\", expected \"$LATEST_VERSION\""
    ERRORS=$((ERRORS + 1))
else
    echo "  ✅ package-lock.json — packages[\"\"].version $LOCK_ROOT_VER"
fi

echo ""

if [ "$ERRORS" -gt 0 ]; then
    echo "❌ Found $ERRORS version misalignment(s)."
    echo ""
    echo "Fix:"
    echo "  1. npm version $LATEST_VERSION --no-git-tag-version  (bumps package.json + package-lock.json)"
    echo "  2. npm run stamp-version                              (regenerates src/version.ts)"
    echo "Or, if CHANGELOG is behind a tag you already pushed, add the"
    echo "missing '## [X.Y.Z] - YYYY-MM-DD' section."
    exit 1
fi

echo "✅ All version constants match CHANGELOG v$LATEST_VERSION."
