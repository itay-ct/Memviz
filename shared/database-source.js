export const DEFAULT_DATABASE_ENGINE = 'redis';
export const DEFAULT_DATABASE_SERVICE = 'self-managed';

export const DATABASE_ENGINE_OPTIONS = [
  { value: 'redis', label: 'Redis' },
  { value: 'valkey', label: 'Valkey' },
];

export const DATABASE_SERVICE_OPTIONS = [
  { value: 'elasticache', label: 'ElastiCache' },
  { value: 'memorystore', label: 'Memorystore' },
  { value: 'self-managed', label: 'Redis' },
  { value: 'redis-cloud', label: 'Redis Cloud' },
  { value: 'redis-software', label: 'Redis' },
];

const DATABASE_ENGINE_VALUES = new Set(DATABASE_ENGINE_OPTIONS.map((option) => option.value));
const DATABASE_SERVICE_VALUES = new Set(DATABASE_SERVICE_OPTIONS.map((option) => option.value));

function normalizeChoice(value, validValues, fallback) {
  const normalizedValue = String(value ?? '')
    .trim()
    .toLowerCase();
  return validValues.has(normalizedValue) ? normalizedValue : fallback;
}

function extractInfoValue(info, key) {
  const normalizedKey = String(key ?? '').toLowerCase();

  for (const line of String(info ?? '').split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const lineKey = line.slice(0, separatorIndex).trim().toLowerCase();
    if (lineKey !== normalizedKey) {
      continue;
    }

    const value = line.slice(separatorIndex + 1).trim();
    return value || null;
  }

  return null;
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
  return getOptionLabel(DATABASE_SERVICE_OPTIONS, service, 'Redis');
}

export function getDatabaseSourceDisplayLabel(source = {}) {
  const { engine, service } = normalizeDatabaseSource(source);
  const engineLabel = getDatabaseEngineLabel(engine);

  if (service === 'redis-cloud') {
    return 'Redis Cloud';
  }

  if (service === 'elasticache') {
    return `ElastiCache ${engineLabel}`;
  }

  if (service === 'memorystore') {
    return `Memorystore ${engineLabel}`;
  }

  if (engine === 'valkey') {
    return 'Valkey';
  }

  return 'Redis';
}

export function extractDatabaseHost(hostOrUrl = '') {
  const rawValue = String(hostOrUrl ?? '').trim();
  if (!rawValue) {
    return '';
  }

  if (/^rediss?:\/\//i.test(rawValue)) {
    try {
      return new URL(rawValue).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  const withoutWhitespace = rawValue.split(/\s+/)[0] ?? '';
  const withoutPath = withoutWhitespace.split(/[/?#]/)[0] ?? '';
  const withoutAuth = withoutPath.includes('@') ? withoutPath.split('@').pop() : withoutPath;

  if (withoutAuth.startsWith('[')) {
    const closeBracketIndex = withoutAuth.indexOf(']');
    return closeBracketIndex === -1
      ? withoutAuth.toLowerCase()
      : withoutAuth.slice(1, closeBracketIndex).toLowerCase();
  }

  return withoutAuth.replace(/:\d+$/, '').toLowerCase();
}

export function detectDatabaseSourceFromHost(hostOrUrl = '') {
  const host = extractDatabaseHost(hostOrUrl);

  if (
    host === 'redislabs.com' ||
    host.endsWith('.redislabs.com') ||
    host === 'redis.io' ||
    host.endsWith('.redis.io') ||
    host.endsWith('.redis-cloud.com')
  ) {
    return {
      engine: DEFAULT_DATABASE_ENGINE,
      service: 'redis-cloud',
    };
  }

  if (host === 'cache.amazonaws.com' || host.endsWith('.cache.amazonaws.com')) {
    return {
      engine: DEFAULT_DATABASE_ENGINE,
      service: 'elasticache',
    };
  }

  if (
    host.includes('memorystore') ||
    host.endsWith('.redis.goog') ||
    host.endsWith('.memorystore.googleapis.com') ||
    host.endsWith('.memorystore.googleusercontent.com')
  ) {
    return {
      engine: DEFAULT_DATABASE_ENGINE,
      service: 'memorystore',
    };
  }

  return {
    engine: DEFAULT_DATABASE_ENGINE,
    service: DEFAULT_DATABASE_SERVICE,
  };
}

export function detectDatabaseSourceFromServerInfo(serverInfo = '') {
  const valkeyVersion = extractInfoValue(serverInfo, 'valkey_version');
  if (valkeyVersion) {
    return {
      engine: 'valkey',
      version: valkeyVersion,
    };
  }

  const redisVersion = extractInfoValue(serverInfo, 'redis_version');
  if (redisVersion) {
    return {
      engine: 'redis',
      version: redisVersion,
    };
  }

  return {
    engine: null,
    version: null,
  };
}

export function detectDatabaseConnectionDetails({ host, serverInfo } = {}) {
  const hostSource = detectDatabaseSourceFromHost(host);
  const serverSource = detectDatabaseSourceFromServerInfo(serverInfo);
  const engine = hostSource.service === 'redis-cloud'
    ? DEFAULT_DATABASE_ENGINE
    : serverSource.engine ?? hostSource.engine;

  return {
    databaseSource: normalizeDatabaseSource({
      engine,
      service: hostSource.service,
    }),
    databaseVersion: serverSource.version ?? null,
  };
}
