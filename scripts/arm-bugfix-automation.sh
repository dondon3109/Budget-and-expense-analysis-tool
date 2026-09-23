#!/usr/bin/env bash
#
# Arms the bugfix automation with the values only Don can create, as repository secrets.
#
#   bash scripts/arm-bugfix-automation.sh
#
# Every prompt is optional, so paste only what you have. Nothing is echoed, nothing is written to
# disk, and running it again is safe: setting a secret replaces it.
set -euo pipefail

if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1 ||
  ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Run this from the repository with gh installed and signed in." >&2
  exit 1
fi

secrets=(
  "OPS_EGRESS_TOKEN|Worker OPS_EGRESS_TOKEN"
  "DEEPSEEK_API_KEY|Model API key for the draft job"
  "TELEGRAM_BOT_TOKEN|Telegram bot token from @BotFather"
  "TELEGRAM_CHAT_ID|Telegram chat id (message.chat.id from getUpdates)"
)

written=0
for entry in "${secrets[@]}"; do
  name="${entry%%|*}"
  value="${!name:-}"
  if [ -z "$value" ]; then
    # A prompt that gets EOF, for example when stdin is not a terminal, skips the value rather
    # than aborting the run under set -e.
    read -rsp "${entry#*|} (leave empty to skip): " value || true
    echo
  fi
  if [ -z "$value" ]; then
    continue
  fi
  if gh secret set "$name" --body "$value"; then
    written=$((written + 1))
  else
    echo "Could not set $name. Set it by hand with gh secret set $name." >&2
  fi
done
echo "Set $written repository secret(s)."

cat <<'NEXT'

Still yours to do, none of it scriptable from here:
  1. Push, so the schedule in bugfix.yml runs from main.
  2. Deactivate "Zoption Bugfix Draft Dispatch" in n8n on HomeCore and revoke the fine grained
     GitHub token it held. Until then it claims reports that the schedule never sees.
  3. OPEN_BUGFIX_PRS=true opens draft pull requests; unset it to go back to shadow mode.
NEXT
