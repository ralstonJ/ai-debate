#!/usr/bin/env bash
# Builds a macOS .app on the Desktop that starts the dev server and opens the browser.
#
# The dev server runs on --port 0 (a free port chosen at boot), so the launcher can't
# assume a URL. It tees the server output to a log, polls for the "http://localhost:PORT"
# line, then opens whatever port was actually assigned.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Voice Debate"
APP_PATH="$HOME/Desktop/${APP_NAME}.app"
SCRIPT_SRC="$(mktemp -t voice-debate-launcher).applescript"

cat > "$SCRIPT_SRC" <<APPLESCRIPT
set projectPath to "${PROJECT_DIR}"
set logPath to projectPath & "/.dev-server.log"

tell application "Terminal"
	activate
	do script "cd " & quoted form of projectPath & " && rm -f .dev-server.log && npm run dev 2>&1 | tee .dev-server.log"
end tell

-- Wait for Next.js to report the port it picked, then open it.
set serverURL to ""
repeat 90 times
	delay 1
	try
		set serverURL to do shell script "grep -Eo 'http://localhost:[0-9]+' " & quoted form of logPath & " 2>/dev/null | head -1"
	on error
		set serverURL to ""
	end try
	if serverURL is not "" then
		delay 1
		do shell script "open " & quoted form of serverURL
		exit repeat
	end if
end repeat

if serverURL is "" then
	display dialog "The dev server didn't report a port within 90 seconds. Check the Terminal window." buttons {"OK"} default button "OK" with icon caution
end if
APPLESCRIPT

rm -rf "$APP_PATH"
osacompile -o "$APP_PATH" "$SCRIPT_SRC"
rm -f "$SCRIPT_SRC"

echo "Created $APP_PATH"
