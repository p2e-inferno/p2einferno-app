#!/usr/bin/env bash
# Sets (or removes) the Telegram bot webhook using values from .env.local
# Usage:
#   ./scripts/setup-telegram-webhook.sh <ngrok-url>    # Register webhook (dev)
#   ./scripts/setup-telegram-webhook.sh --production    # Register for production
#   ./scripts/setup-telegram-webhook.sh --info          # Check current webhook
#   ./scripts/setup-telegram-webhook.sh --remove        # Remove webhook

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env.local not found at $ENV_FILE"
  exit 1
fi

# Load env vars (strip optional surrounding quotes and whitespace)
strip_quotes() {
  local val="$1"
  val="${val#"${val%%[![:space:]]*}"}"   # trim leading whitespace
  val="${val%"${val##*[![:space:]]}"}"   # trim trailing whitespace
  val="${val#\"}" ; val="${val%\"}"       # strip double quotes
  val="${val#\'}" ; val="${val%\'}"       # strip single quotes
  printf '%s' "$val"
}

TELEGRAM_BOT_TOKEN="$(strip_quotes "$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d'=' -f2-)")"
TELEGRAM_WEBHOOK_SECRET="$(strip_quotes "$(grep '^TELEGRAM_WEBHOOK_SECRET=' "$ENV_FILE" | cut -d'=' -f2-)")"

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "Error: TELEGRAM_BOT_TOKEN not found in .env.local"
  exit 1
fi

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

# --production: register production webhook
if [ "${1:-}" = "--production" ]; then
  if [ -z "$TELEGRAM_WEBHOOK_SECRET" ]; then
    echo "Error: TELEGRAM_WEBHOOK_SECRET not found in .env.local"
    exit 1
  fi

  # Validate webhook secret format (Telegram only allows A-Z, a-z, 0-9, _, -)
  if ! [[ "$TELEGRAM_WEBHOOK_SECRET" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "Error: TELEGRAM_WEBHOOK_SECRET contains invalid characters"
    echo "Telegram only allows: A-Z, a-z, 0-9, _, -"
    exit 1
  fi

  WEBHOOK_URL="https://www.p2einferno.com/api/webhooks/telegram"
  echo "Registering PRODUCTION webhook..."
  echo "  URL: ${WEBHOOK_URL}"
  echo "  Filter: message updates only"
  echo "  Pending: dropped"
  echo ""

  # Production: only receive message updates, drop pending updates for clean state
  curl -s -X POST "${API}/setWebhook" \
    -H 'Content-Type: application/json' \
    -d "{\"url\":\"${WEBHOOK_URL}\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\"],\"drop_pending_updates\":true}" \
    | python3 -m json.tool
  exit 0
fi

# --info: show current webhook status
if [ "${1:-}" = "--info" ]; then
  echo "Fetching webhook info..."
  curl -s "${API}/getWebhookInfo" | python3 -m json.tool
  exit 0
fi

# --remove: delete webhook
if [ "${1:-}" = "--remove" ]; then
  echo "Removing webhook..."
  curl -s -X POST "${API}/deleteWebhook" | python3 -m json.tool
  exit 0
fi

# Register webhook with provided URL
NGROK_URL="${1:-}"
if [ -z "$NGROK_URL" ]; then
  echo "Usage:"
  echo "  $0 <ngrok-url>       Register webhook (dev)"
  echo "  $0 --production      Register production webhook"
  echo "  $0 --info            Check current webhook"
  echo "  $0 --remove          Remove webhook"
  exit 1
fi

if [ -z "$TELEGRAM_WEBHOOK_SECRET" ]; then
  echo "Error: TELEGRAM_WEBHOOK_SECRET not found in .env.local"
  exit 1
fi

# Validate webhook secret format (Telegram only allows A-Z, a-z, 0-9, _, -)
if ! [[ "$TELEGRAM_WEBHOOK_SECRET" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "Error: TELEGRAM_WEBHOOK_SECRET contains invalid characters"
  echo "Telegram only allows: A-Z, a-z, 0-9, _, -"
  exit 1
fi

# Strip trailing slash from URL
NGROK_URL="${NGROK_URL%/}"
WEBHOOK_URL="${NGROK_URL}/api/webhooks/telegram"

echo "Registering webhook (dev mode - all update types)..."
echo "  URL: ${WEBHOOK_URL}"
echo ""

# Dev: receive all update types and keep pending updates for testing
curl -s -X POST "${API}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"${WEBHOOK_URL}\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\"}" \
  | python3 -m json.tool
