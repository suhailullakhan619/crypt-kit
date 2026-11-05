#!/usr/bin/env bash
# Usage: scripts/task.sh <spec> <state x|-| > <taskId...>   — flips checkbox state in tasks.md
spec=$1; state=$2; shift 2
f=".kiro/specs/$spec/tasks.md"
for id in "$@"; do
  esc=$(printf '%s' "$id" | sed 's/\./\./g')
  sed -i -E "s/^(\s*- )\[[ x~-]\](\*?) (${esc}\.? )/\1[${state}]\2 \3/" "$f"
done
grep -nE "^\s*- \[[x-]\]" "$f" | head -50
