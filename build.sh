#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export DEBIAN_FRONTEND=noninteractive

version_ge() {
  local left="$1"
  local right="$2"
  [[ "$(printf '%s\n%s\n' "$right" "$left" | sort -V | head -n1)" == "$right" ]]
}

ensure_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "build.sh must run as root during image creation." >&2
    exit 1
  fi
}

ensure_base_packages() {
  apt-get update
  apt-get install -y ca-certificates curl gpg lsb-release
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    return
  fi

  curl -fsSL https://get.docker.com | sh
}

ensure_compose() {
  if docker compose version >/dev/null 2>&1; then
    return
  fi

  apt-get update
  apt-get install -y docker-compose-plugin
}

ensure_nodejs() {
  if command -v node >/dev/null 2>&1; then
    local node_version
    node_version="$(node -p 'process.versions.node')"
    if version_ge "$node_version" "20.0.0"; then
      return
    fi
  fi

  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
}

ensure_memtier() {
  if command -v memtier_benchmark >/dev/null 2>&1; then
    local current_version
    current_version="$(memtier_benchmark --version | sed -E 's/.*v=([^ ]+).*/\1/' | head -n1)"
    if version_ge "$current_version" "2.3.0" && memtier_benchmark --help 2>&1 | grep -q -- '--statsd-host'; then
      echo "Using host memtier_benchmark ${current_version} with StatsD support."
      return
    fi
  fi

  curl -fsSL https://packages.redis.io/gpg | gpg --dearmor --yes -o /usr/share/keyrings/redis-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" \
    > /etc/apt/sources.list.d/redis.list

  apt-get update
  apt-get install -y memtier-benchmark

  if ! memtier_benchmark --help 2>&1 | grep -q -- '--statsd-host'; then
    echo "Host memtier_benchmark does not expose StatsD support; continuing because the memviz container includes a compatible runtime."
    return
  fi

  echo "Installed host memtier_benchmark with StatsD support."
}

prime_runtime_assets() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable docker || true
    systemctl start docker || true
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not available during image build; skipping prebuild steps."
    return
  fi

  docker pull redis:7-alpine
  docker compose build memviz
}

ensure_root
ensure_base_packages
ensure_docker
ensure_compose
ensure_nodejs
ensure_memtier
prime_runtime_assets
