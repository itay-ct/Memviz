# memviz

memviz is a small Redis benchmarking workspace built around `memtier_benchmark`.
It lets you connect to Redis, launch benchmark presets, watch live StatsD-backed metrics, compare finished runs, and export results from a single web app.

## Quick start

One command:

```bash
npm run setup
```

`npm run setup` installs dependencies, builds the frontend, starts the production server, and performs the Memtier runtime check on first launch. If a compatible local `memtier_benchmark` is not available, memviz may pull the Docker fallback image before the app becomes ready.

memviz serves the app on [http://127.0.0.1:3000](http://127.0.0.1:3000). Keep that terminal open while you use the app, and stop it with `Ctrl+C` when you are done.

If you prefer the explicit two-step flow:

```bash
npm install
npm run build
npm run start
```

## Development

For iterative development:

```bash
npm run dev
```

That command starts the Node server watcher and the Vite frontend together so you can work on the app without rebuilding between edits.

Other useful commands:

- `npm run test` runs the Node test suite.
- `npm run build` creates the production frontend bundle in `dist/`.
- `npm run start` serves the production build with the Express backend.

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

## Configuration

memviz is usable with no environment variables, but a few settings are worth documenting when you want a different default target or host layout.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port for the memviz web app and API server. |
| `MEMVIZ_DEFAULT_REDIS_HOST` | `127.0.0.1` | Default Redis host shown and used for the initial connection bootstrap. |
| `MEMVIZ_DEFAULT_REDIS_PORT` | `6379` | Default Redis port paired with `MEMVIZ_DEFAULT_REDIS_HOST`. |
| `MEMVIZ_STATSD_HOST` | `127.0.0.1` | Host the internal StatsD receiver binds to for live benchmark metrics. |
| `MEMVIZ_STATSD_PORT` | `8125` | UDP port the internal StatsD receiver listens on. |

Examples:

```bash
PORT=4000 npm run start
MEMVIZ_DEFAULT_REDIS_HOST=redis MEMVIZ_DEFAULT_REDIS_PORT=6379 npm run start
```

Redis target examples you can use in the UI:

- `127.0.0.1:6379`
- `redis://default:secret@cache.example.com:6379/0`

## PS Portal Packaging

This repo includes a first-pass PS Portal packaging flow for a self-contained demo image:

- `docker-compose.yml` starts `memviz` and a local Redis together.
- `Dockerfile` builds the production Memviz container and installs `memtier_benchmark`.
- `build.sh` prepares a Linux VM image with Docker, Node.js 20+, and a host copy of `memtier_benchmark`.
- `start.sh` boots the compose stack on VM startup.
- `.github/workflows/trigger-build.yaml` triggers the centralized PS Portal image builder.

The compose stack exposes only Memviz on port `3000`. Inside the portal image, Memviz uses environment overrides so its default Redis target points at the bundled `redis` service.

For the first image, use these defaults in the portal flow:

- main application port: `3000`
- image source: "I've my own image"
- required GitHub secrets:
  - `SOURCE_REPO_READ_TOKEN`
  - `PS_IMAGE_BUILDER_TOKEN`

## Presets

A preset is a single YAML file that groups together a workflow's built-in benchmark tests and dataset presets. Presets are the easiest way to let more people tailor memviz to their own Redis workflow without recompiling the app or shipping a new release.

memviz loads every `*.preset.yaml` file from the project root when it starts. The topbar preset picker lets you switch between them, you can import one in the UI with `Load preset file…`, and you can also open a preset directly by URL with a query string such as:

```text
http://127.0.0.1:3000/?preset=search
```

The full authoring guide, validation notes, and example preset live in [PRESETS.md](./PRESETS.md).
