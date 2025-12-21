#!/bin/sh
set -e

# deploy.sh - pull latest code, build and restart services using docker compose
# Usage: ./scripts/deploy.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="docker-compose.yml"
SERVICE_NAME="mqtt-usb-hub-control"

# choose compose command: prefer `docker compose`, fall back to `docker-compose`
COMPOSE_CMD="docker compose"
if ! command -v docker >/dev/null 2>&1; then
  echo "docker CLI not found"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  else
    echo "Neither 'docker compose' nor 'docker-compose' available"
    exit 1
  fi
fi

cd "$REPO_ROOT"

echo "Pulling latest code..."
git pull origin main

echo "Pulling images (if applicable)..."
$COMPOSE_CMD -f "$COMPOSE_FILE" pull || true

echo "Stopping existing services..."
$COMPOSE_CMD -f "$COMPOSE_FILE" down || true

echo "Building and starting services..."
$COMPOSE_CMD -f "$COMPOSE_FILE" up -d --build

echo "Waiting for service to become healthy or Up (timeout 60s)..."
for i in $(seq 1 60); do
  status=$(docker inspect --format='{{.State.Health.Status}}' "$SERVICE_NAME" 2>/dev/null || echo "")
  if [ "$status" = "healthy" ]; then
    echo "Service reported healthy"
    break
  fi
  $COMPOSE_CMD -f "$COMPOSE_FILE" ps | grep "$SERVICE_NAME" | grep Up >/dev/null 2>&1 && { echo "Container is Up"; break; }
  sleep 1
done

echo "Current compose ps:"
$COMPOSE_CMD -f "$COMPOSE_FILE" ps

echo "Recent logs (tail 200):"
$COMPOSE_CMD -f "$COMPOSE_FILE" logs --tail=200

echo "Deploy finished."





