#!/usr/bin/env bash
#
# This file is part of BitGauge.
#
# Copyright (c) 2026 Roberto Leinardi
#
# BitGauge is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# BitGauge is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
#

# gofmt-on-edit.sh — Claude Code PostToolUse hook (configured in .claude/settings.json).
# Auto-formats Go files immediately after an Edit/Write tool call so formatting
# drift is fixed at edit time instead of failing later at pre-commit.
#
# Input: hook payload JSON on stdin; the edited path is at .tool_input.file_path.
# Always exits 0 (a formatting fix must never block the agent).

set -euo pipefail

file="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"

case "$file" in
  *.go)
    if [[ -f "$file" ]] && command -v gofmt >/dev/null 2>&1; then
      gofmt -w "$file" || true
    fi
    ;;
esac

exit 0
