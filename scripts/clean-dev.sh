#!/usr/bin/env bash
# clean-dev.sh — remove gitignored dev artefacts (loose PNGs, server logs).
#
# Safe by default: prints what *would* be removed.
# Pass `--apply` to actually delete.

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--apply" ]]; then
  echo "▶  Removing gitignored files…"
  git clean -fX -- ':(exclude)node_modules' ':(exclude)package-lock.json'
  echo "✅  Clean."
else
  echo "ℹ  Dry-run. Pass --apply to actually delete."
  echo
  git clean -nX -- ':(exclude)node_modules' ':(exclude)package-lock.json'
fi
