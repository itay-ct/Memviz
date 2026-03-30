# memviz

memviz is a small Redis benchmarking workspace built around `memtier_benchmark`.
It lets you connect to Redis, launch benchmark presets, watch live StatsD-backed metrics, compare finished runs, and export results from a single web app.

## Quick start

One command:

```bash
npm run setup
```

memviz serves the app on [http://127.0.0.1:3000](http://127.0.0.1:3000).

If you prefer the explicit two-step flow:

```bash
npm install
npm run start
```

## Memtier dependency

memviz needs `memtier_benchmark` with StatsD support because the live charts depend on `--statsd-host`.

On startup, memviz runs a setup check:

1. It looks for a local `memtier_benchmark`.
2. If local Memtier is present and is `2.3.0` or newer, memviz uses it.
3. Otherwise, memviz pulls the official Docker image `redislabs/memtier_benchmark:latest` and uses that runtime instead.

This means:

- You do not need to install Memtier manually if Docker is available.
- If you do want a local binary, it must be `2.3.0` or newer.
- Docker is the automatic fallback path for a one-stop setup.

Official Memtier repository:

- [memtier_benchmark](https://github.com/RedisLabs/memtier_benchmark)

## Requirements

- Node.js 20+
- Redis target
- Either:
  - Docker
  - or local `memtier_benchmark >= 2.3.0`

Local Redis without auth works out of the box at `127.0.0.1:6379`.
