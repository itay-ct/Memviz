#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but was not found." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose is required but was not found." >&2
  exit 1
fi

if ! docker image inspect memviz-portal:latest >/dev/null 2>&1; then
  echo "Building memviz-portal:latest..."
  docker compose build memviz
fi

echo "Starting memviz and Redis..."
docker compose up -d

echo "Current container status:"
docker compose ps
