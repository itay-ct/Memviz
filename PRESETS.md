# memviz preset authoring

memviz presets are meant to make the app adaptable by configuration instead of by rebuild. A team can create a new `*.preset.yaml` file, load it into memviz, and start using the new workflow without recompiling the frontend or cutting a new memviz release.

That matters in two common cases:

- You want to ship a workflow-specific bundle of benchmark tests and dataset presets with a deployment.
- You want other users to author their own preset files and apply them from the UI with `Load preset file…`.

## How presets work

A preset is a single YAML document that defines:

- `name`: the stable preset id used internally and in the `?preset=` query parameter.
- `label`: the display name shown in the preset picker.
- `tests`: the built-in benchmark tests shown for that preset.
- `dataset_presets`: the built-in dataset presets shown in the dataset loading flow.

memviz discovers presets in two ways:

1. It loads every `*.preset.yaml` file from the project root when the server starts.
2. It can import a preset file from the browser, save it into the project root on the running host, and make it selectable immediately.

Because presets are data files, not compiled code, you can extend the workflow library without publishing a new app build.

## Creating a preset

1. Create a new file in the project root with the suffix `.preset.yaml`.
2. Give it a unique `name` and `label`.
3. Add one or more `tests`.
4. Add any `dataset_presets` that belong to that workflow.
5. Restart memviz, or import the file through `Load preset file…` in the UI.

You can also link directly to a preset once it exists:

```text
http://127.0.0.1:3000/?preset=search
```

## Example preset

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

## Validation rules

memviz validates preset files on load and import. The most important rules are:

- Preset `name` values must be unique across all preset files.
- `dataset_presets` ids must be unique within the preset file that defines them.
- Dataset preset `name`, `storage_yaml`, `total_size`, and `dataset_yaml` are required.
- Imported preset names must not collide with an existing preset already on disk.

If a preset fails validation, memviz keeps the existing library unchanged and returns an error explaining what to fix.

## Authoring guidance

- Use a stable `name` because it becomes part of bookmarkable URLs.
- Keep tests grouped by workflow so the UI stays focused for the person running the benchmark.
- Put the dataset preset that matches a benchmark flow in the same file so loading the right data is discoverable.
- Treat presets as shareable artifacts. They are a good handoff format for teammates who need repeatable scenarios but should not have to patch the app itself.
