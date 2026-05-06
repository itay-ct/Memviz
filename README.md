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
npm run build
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

A preset is a single YAML file that groups together a workflow's built-in benchmark tests and its built-in dataset presets.

memviz loads every `*.preset.yaml` file from the project root when it starts. The topbar preset picker lets you switch between them, and you can also open a preset directly by URL with a query string such as:

```text
http://127.0.0.1:3000/?preset=search
```

### What goes in a preset

Each preset file can contain:

- `name`: the stable preset id used by memviz and the `?preset=` URL parameter.
- `label`: the display name shown in the UI.
- `tests`: the built-in tests shown in the test picker for that preset.
- `dataset_presets`: the built-in dataset presets shown in the dataset load dialog for that preset.

### Creating a preset

1. Create a new file in the project root with the suffix `.preset.yaml`.
2. Give it a unique `name` and `label`.
3. Add one or more `tests`.
4. Add any `dataset_presets` that should ship with that workflow.
5. Restart memviz, or use the in-app "Load preset file…" option to import it from your browser.

Example:

```yaml
name: cache-lab
label: Cache Lab

tests:
  - id: get-heavy
    name: GET Heavy
    kind: workload
    defaults:
      clients: 40
      threads: 4
      testTime: 15
      limitMode: time
      requestCount: 150000
      rateLimitEnabled: false
      rateLimit: 20000
      pipeline: 1
      keyPrefix: cache:
      setRatio: 1
      getRatio: 20
      dataSize: 64

dataset_presets:
  - id: cache-json
    name: Cache JSON
    record_count: 50000
    total_size: approx. 60 MB raw
    dataset_yaml: |
      name: cache-json
      records: 50000
      seed: 42
      generator:
        type: faker
        entity: record
        fields:
          id:
            type: int
            unique: true
          title:
            type: text
    storage_yaml: |
      type: json
      key_prefix: "cache:"
      write_mode: pipeline
      pipeline_size: 1000
      index:
        enabled: false
```

### Notes

- Preset names must be unique across all preset files.
- Dataset preset ids must be unique within the preset file that defines them.
- Tests only appear inside the preset they belong to, which keeps different workflows separate and easier to understand.
