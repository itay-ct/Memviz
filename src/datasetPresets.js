export const BLANK_DATASET_YAML = `name: custom-dataset
records: 10000
seed: 42
generator:
  type: faker
  entity: record
  fields:
    id:
      type: int
      unique: true
    name:
      type: full_name
`;

export const BLANK_STORAGE_YAML = `type: json
key_prefix: "record:"
write_mode: pipeline
pipeline_size: 1000
index:
  enabled: false
`;
