export const DEFAULT_DATABASE_ENGINE = 'redis';
export const DEFAULT_DATABASE_SERVICE = 'self-managed';

export const DATABASE_ENGINE_OPTIONS = [
  { value: 'redis', label: 'Redis' },
  { value: 'valkey', label: 'Valkey' },
];

export const DATABASE_SERVICE_OPTIONS = [
  { value: 'elasticache', label: 'ElastiCache' },
  { value: 'memorystore', label: 'Memorystore' },
  { value: 'self-managed', label: 'Self-Managed' },
  { value: 'redis-cloud', label: 'Redis Cloud' },
  { value: 'redis-software', label: 'Redis Software' },
];

const DATABASE_ENGINE_VALUES = new Set(DATABASE_ENGINE_OPTIONS.map((option) => option.value));
const DATABASE_SERVICE_VALUES = new Set(DATABASE_SERVICE_OPTIONS.map((option) => option.value));

function normalizeChoice(value, validValues, fallback) {
  const normalizedValue = String(value ?? '')
    .trim()
    .toLowerCase();
  return validValues.has(normalizedValue) ? normalizedValue : fallback;
}

export function normalizeDatabaseSource(source = {}) {
  return {
    engine: normalizeChoice(
      source.engine,
      DATABASE_ENGINE_VALUES,
      DEFAULT_DATABASE_ENGINE,
    ),
    service: normalizeChoice(
      source.service,
      DATABASE_SERVICE_VALUES,
      DEFAULT_DATABASE_SERVICE,
    ),
  };
}

function getOptionLabel(options, value, fallback) {
  return options.find((option) => option.value === value)?.label ?? fallback;
}

export function getDatabaseEngineLabel(engine) {
  return getOptionLabel(DATABASE_ENGINE_OPTIONS, engine, 'Redis');
}

export function getDatabaseServiceLabel(service) {
  return getOptionLabel(DATABASE_SERVICE_OPTIONS, service, 'Self-Managed');
}
