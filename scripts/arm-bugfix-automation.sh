#!/usr/bin/env bash
#
# Arms the bugfix automation with the three values only Don can create.
#
#   bash scripts/arm-bugfix-automation.sh     from this repository: n8n over SSH, plus gh secrets
#   bash scripts/arm-bugfix-automation.sh     on HomeCore: the n8n half only
#
# Every prompt is optional, so paste only what you have. Nothing is echoed, nothing is written to
# disk, and running it again is safe: importing a credential by id updates it in place.
set -euo pipefail

N8N_HOST="${N8N_HOST:-homecore@192.168.1.5}"
N8N_CONTAINER="${N8N_CONTAINER:-n8n}"

# Both credential ids already exist in n8n, and reusing them is what makes this an update.
EGRESS_CRED_ID="858bc149-6581-464a-838d-66c338b2d94f"
GITHUB_CRED_ID="6d99cdd5-1a12-453f-b8bd-e72bef9874d0"

ask() {
  local value
  if [ -n "${!1:-}" ]; then
    return
  fi
  # A prompt that gets EOF, for example when stdin is not a terminal, skips the value rather
  # than aborting the run under set -e.
  read -rsp "$2 (leave empty to skip): " value || true
  echo
  printf -v "$1" '%s' "$value"
}

ask OPS_EGRESS_TOKEN "Worker OPS_EGRESS_TOKEN"
ask GITHUB_BUGFIX_PAT "GitHub fine grained PAT, Actions: write only"
ask DEEPSEEK_API_KEY "Model API key for the draft job"

# These tokens are pasted, not generated, so a quote or a backslash is far more likely to be a
# paste accident than a real character. Refuse it rather than write a broken credential.
reject_unquotable() {
  if [[ "$2" == *'"'* || "$2" == *'\'* ]]; then
    echo "$1 contains a quote or a backslash. Paste it into the n8n UI instead." >&2
    exit 1
  fi
}
reject_unquotable OPS_EGRESS_TOKEN "$OPS_EGRESS_TOKEN"
reject_unquotable GITHUB_BUGFIX_PAT "$GITHUB_BUGFIX_PAT"

# --- n8n credentials -------------------------------------------------------------------------
entries=()
if [ -n "$OPS_EGRESS_TOKEN" ]; then
  entries+=("{\"id\":\"$EGRESS_CRED_ID\",\"name\":\"Zoption ops egress\",\"type\":\"httpBearerAuth\",\"data\":{\"token\":\"$OPS_EGRESS_TOKEN\"}}")
fi
if [ -n "$GITHUB_BUGFIX_PAT" ]; then
  entries+=("{\"id\":\"$GITHUB_CRED_ID\",\"name\":\"GitHub bugfix dispatch\",\"type\":\"httpBearerAuth\",\"data\":{\"token\":\"$GITHUB_BUGFIX_PAT\"}}")
fi

if [ "${#entries[@]}" -gt 0 ]; then
  joined="$(IFS=,; echo "${entries[*]}")"
  # The payload travels as base64 so no layer of quoting can mangle a token, and the same command
  # runs on the homeserver and over SSH from this repository.
  payload="$(printf '[%s]' "$joined" | base64 | tr -d '\n')"
  import_credentials="set -e; echo $payload | base64 -d > /tmp/arm-creds.json; docker cp /tmp/arm-creds.json $N8N_CONTAINER:/tmp/arm-creds.json; docker exec $N8N_CONTAINER n8n import:credentials --input=/tmp/arm-creds.json; docker exec $N8N_CONTAINER rm -f /tmp/arm-creds.json; rm -f /tmp/arm-creds.json"

  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$N8N_CONTAINER"; then
    echo "Writing the n8n credentials on this machine."
    bash -c "$import_credentials"
  else
    echo "Writing the n8n credentials on $N8N_HOST. Enter the SSH password when asked."
    ssh "$N8N_HOST" "$import_credentials"
  fi
fi

# --- repository secrets ----------------------------------------------------------------------
# gh needs all three of: the binary, a signed in account, and a git work tree to resolve the
# repository from. The homeserver has the first two and not the third, which is exactly the case
# this guard exists for.
secrets_written=0
if command -v gh >/dev/null 2>&1 &&
  gh auth status >/dev/null 2>&1 &&
  git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [ -n "$OPS_EGRESS_TOKEN" ]; then
    if gh secret set OPS_EGRESS_TOKEN --body "$OPS_EGRESS_TOKEN"; then
      secrets_written=$((secrets_written + 1))
    else
      echo "Could not set OPS_EGRESS_TOKEN. Set it by hand, or rerun this from the repository." >&2
    fi
  fi
  if [ -n "$DEEPSEEK_API_KEY" ]; then
    if gh secret set DEEPSEEK_API_KEY --body "$DEEPSEEK_API_KEY"; then
      secrets_written=$((secrets_written + 1))
    else
      echo "Could not set DEEPSEEK_API_KEY. Set it by hand, or rerun this from the repository." >&2
    fi
  fi
  if [ "$secrets_written" -gt 0 ]; then
    echo "Set $secrets_written repository secret(s) on the current gh repository."
  fi
else
  echo "Skipped the repository secrets: gh is missing, not signed in, or this is not a git work tree."
fi

cat <<'NEXT'

Still yours to do, none of it scriptable from here:
  1. Push this branch and approve the production environment, so the Worker carries the egress
     endpoint change. Until bugfix.yml is on main, a dispatch returns 404.
  2. Leave the repository variable OPEN_BUGFIX_PRS unset to stay in shadow mode, where the draft
     is a workflow artifact. Set it to true to start opening draft pull requests.
  3. Activate "Zoption Bugfix Draft Dispatch" in n8n.
NEXT
