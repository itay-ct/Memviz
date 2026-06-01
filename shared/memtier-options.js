const PATTERN_CHOICES = [
  { label: 'Gaussian', value: 'G' },
  { label: 'Random', value: 'R' },
  { label: 'Zipf', value: 'Z' },
  { label: 'Sequential', value: 'S' },
  { label: 'Parallel', value: 'P' },
];

export const MEMTIER_ADVANCED_OPTION_GROUPS = [
  {
    id: 'connection',
    title: 'Connection and general',
    options: [
      {
        key: 'protocol',
        flag: '--protocol',
        label: 'Protocol',
        type: 'select',
        defaultValue: 'redis',
        choices: [
          { label: 'redis', value: 'redis' },
          { label: 'RESP2', value: 'resp2' },
          { label: 'RESP3', value: 'resp3' },
          { label: 'memcache text', value: 'memcache_text' },
          { label: 'memcache binary', value: 'memcache_binary' },
        ],
      },
      { key: 'host', flag: '--host', label: 'Host override', type: 'text' },
      { key: 'port', flag: '--port', label: 'Port override', type: 'integer', min: 1 },
      { key: 'unixSocket', flag: '--unix-socket', label: 'UNIX socket', type: 'text' },
      { key: 'ipv4', flag: '--ipv4', label: 'Force IPv4', type: 'boolean' },
      { key: 'ipv6', flag: '--ipv6', label: 'Force IPv6', type: 'boolean' },
      { key: 'authenticate', flag: '--authenticate', label: 'Authenticate override', type: 'text' },
      { key: 'uri', flag: '--uri', label: 'URI override', type: 'text' },
      { key: 'tls', flag: '--tls', label: 'Enable TLS', type: 'boolean' },
      { key: 'cert', flag: '--cert', label: 'TLS client cert file', type: 'text' },
      { key: 'key', flag: '--key', label: 'TLS private key file', type: 'text' },
      { key: 'cacert', flag: '--cacert', label: 'TLS CA bundle file', type: 'text' },
      { key: 'tlsSkipVerify', flag: '--tls-skip-verify', label: 'Skip TLS verification', type: 'boolean' },
      { key: 'tlsProtocols', flag: '--tls-protocols', label: 'TLS protocols', type: 'text' },
      { key: 'sni', flag: '--sni', label: 'SNI header', type: 'text' },
      { key: 'runCount', flag: '--run-count', label: 'Run count', type: 'integer', min: 1 },
      { key: 'debug', flag: '--debug', label: 'Debug output', type: 'boolean' },
    ],
  },
  {
    id: 'output',
    title: 'Results output',
    options: [
      { key: 'outFile', flag: '--out-file', label: 'Output file', type: 'text' },
      { key: 'jsonOutFile', flag: '--json-out-file', label: 'JSON output file', type: 'text' },
      { key: 'clientStats', flag: '--client-stats', label: 'Per-client stats file', type: 'text' },
      { key: 'hdrFilePrefix', flag: '--hdr-file-prefix', label: 'HDR file prefix', type: 'text' },
      { key: 'showConfig', flag: '--show-config', label: 'Show config', type: 'boolean' },
      { key: 'hideHistogram', flag: '--hide-histogram', label: 'Hide histogram', type: 'boolean' },
      {
        key: 'printPercentiles',
        flag: '--print-percentiles',
        label: 'Print percentiles',
        type: 'text',
        defaultValue: '50,90,99,99.9',
      },
      { key: 'printAllRuns', flag: '--print-all-runs', label: 'Print all runs', type: 'boolean' },
      {
        key: 'realtimeLatencies',
        flag: '--realtime-latencies',
        label: 'Realtime latency block',
        type: 'boolean',
      },
      {
        key: 'commandStatsBreakdown',
        flag: '--command-stats-breakdown',
        label: 'Command stats breakdown',
        type: 'select',
        defaultValue: 'command',
        choices: [
          { label: 'By command', value: 'command' },
          { label: 'By line', value: 'line' },
        ],
      },
      { key: 'graphitePort', flag: '--graphite-port', label: 'Graphite port', type: 'integer', min: 1 },
    ],
  },
  {
    id: 'test',
    title: 'Test behavior',
    options: [
      { key: 'reconnectInterval', flag: '--reconnect-interval', label: 'Reconnect interval', type: 'integer', min: 0 },
      { key: 'reconnectOnError', flag: '--reconnect-on-error', label: 'Reconnect on error', type: 'boolean' },
      {
        key: 'maxReconnectAttempts',
        flag: '--max-reconnect-attempts',
        label: 'Max reconnect attempts',
        type: 'integer',
        min: 0,
      },
      {
        key: 'reconnectBackoffFactor',
        flag: '--reconnect-backoff-factor',
        label: 'Reconnect backoff factor',
        type: 'number',
        min: 0,
      },
      { key: 'retryOnError', flag: '--retry-on-error', label: 'Retry on error', type: 'boolean' },
      { key: 'maxRetries', flag: '--max-retries', label: 'Max retries', type: 'integer' },
      { key: 'retryBackoffMs', flag: '--retry-backoff-ms', label: 'Retry backoff ms', type: 'integer', min: 0 },
      {
        key: 'retryBackoffFactor',
        flag: '--retry-backoff-factor',
        label: 'Retry backoff factor',
        type: 'number',
        min: 0,
      },
      { key: 'retryOn', flag: '--retry-on', label: 'Retry error prefixes', type: 'text' },
      { key: 'maxRetryQueue', flag: '--max-retry-queue', label: 'Max retry queue', type: 'integer', min: 0 },
      { key: 'failedKeysFile', flag: '--failed-keys-file', label: 'Failed keys file', type: 'text' },
      { key: 'connectionTimeout', flag: '--connection-timeout', label: 'Connection timeout sec', type: 'number', min: 0 },
      {
        key: 'threadConnStartMinJitterMicros',
        flag: '--thread-conn-start-min-jitter-micros',
        label: 'Min connection jitter micros',
        type: 'integer',
        min: 0,
      },
      {
        key: 'threadConnStartMaxJitterMicros',
        flag: '--thread-conn-start-max-jitter-micros',
        label: 'Max connection jitter micros',
        type: 'integer',
        min: 0,
      },
      { key: 'multiKeyGet', flag: '--multi-key-get', label: 'Multi-key GET keys', type: 'integer', min: 0 },
      { key: 'selectDb', flag: '--select-db', label: 'SELECT DB', type: 'integer', min: 0 },
      { key: 'distinctClientSeed', flag: '--distinct-client-seed', label: 'Distinct client seed', type: 'boolean' },
      { key: 'randomize', flag: '--randomize', label: 'Randomize seed', type: 'boolean' },
    ],
  },
  {
    id: 'command',
    title: 'Arbitrary command',
    options: [
      {
        key: 'commands',
        flag: '--command',
        label: 'Additional commands',
        type: 'multiline',
        placeholder: 'SET __key__ __data__',
      },
      { key: 'commandRatio', flag: '--command-ratio', label: 'Command ratio', type: 'text' },
      {
        key: 'commandKeyPattern',
        flag: '--command-key-pattern',
        label: 'Command key pattern',
        type: 'select',
        defaultValue: 'R',
        choices: PATTERN_CHOICES,
      },
      { key: 'monitorInput', flag: '--monitor-input', label: 'Monitor input file', type: 'text' },
      {
        key: 'monitorPattern',
        flag: '--monitor-pattern',
        label: 'Monitor pattern',
        type: 'select',
        defaultValue: 'S',
        choices: [
          { label: 'Sequential', value: 'S' },
          { label: 'Random', value: 'R' },
        ],
      },
      {
        key: 'scanIncrementalIteration',
        flag: '--scan-incremental-iteration',
        label: 'SCAN incremental iteration',
        type: 'boolean',
      },
      {
        key: 'scanIncrementalMaxIterations',
        flag: '--scan-incremental-max-iterations',
        label: 'SCAN max iterations',
        type: 'integer',
        min: 0,
      },
      {
        key: 'commandMissTracking',
        flag: '--command-miss-tracking',
        label: 'Command miss tracking',
        type: 'select',
        defaultValue: 'auto',
        choices: [
          { label: 'Auto', value: 'auto' },
          { label: 'Off', value: 'off' },
        ],
      },
    ],
  },
  {
    id: 'object',
    title: 'Object data',
    options: [
      { key: 'dataOffset', flag: '--data-offset', label: 'Data offset', type: 'integer', min: 0 },
      { key: 'randomData', flag: '--random-data', label: 'Random data', type: 'boolean' },
      { key: 'dataSizeRange', flag: '--data-size-range', label: 'Data size range', type: 'text', placeholder: '32-1024' },
      { key: 'dataSizeList', flag: '--data-size-list', label: 'Data size weight list', type: 'text' },
      {
        key: 'dataSizePattern',
        flag: '--data-size-pattern',
        label: 'Data size pattern',
        type: 'select',
        defaultValue: 'R',
        choices: [
          { label: 'Random', value: 'R' },
          { label: 'Sequential', value: 'S' },
        ],
      },
      { key: 'expiryRange', flag: '--expiry-range', label: 'Expiry range', type: 'text' },
    ],
  },
  {
    id: 'imported',
    title: 'Imported data',
    options: [
      { key: 'dataImport', flag: '--data-import', label: 'Data import file', type: 'text' },
      { key: 'dataVerify', flag: '--data-verify', label: 'Data verify', type: 'boolean' },
      { key: 'verifyOnly', flag: '--verify-only', label: 'Verify only', type: 'boolean' },
      { key: 'generateKeys', flag: '--generate-keys', label: 'Generate keys', type: 'boolean' },
      { key: 'noExpiry', flag: '--no-expiry', label: 'Ignore imported expiry', type: 'boolean' },
    ],
  },
  {
    id: 'key',
    title: 'Keys',
    options: [
      { key: 'keyMinimum', flag: '--key-minimum', label: 'Key minimum', type: 'integer', min: 0 },
      { key: 'keyMaximum', flag: '--key-maximum', label: 'Key maximum', type: 'integer', min: 0 },
      {
        key: 'keyPattern',
        flag: '--key-pattern',
        label: 'Set:Get key pattern',
        type: 'text',
        defaultValue: 'R:R',
      },
      { key: 'keyStddev', flag: '--key-stddev', label: 'Key stddev', type: 'number', min: 0 },
      { key: 'keyMedian', flag: '--key-median', label: 'Key median', type: 'number', min: 0 },
      { key: 'keyZipfExp', flag: '--key-zipf-exp', label: 'Key Zipf exponent', type: 'number', min: 0, max: 5 },
    ],
  },
  {
    id: 'wait',
    title: 'WAIT',
    options: [
      { key: 'waitRatio', flag: '--wait-ratio', label: 'Set:WAIT ratio', type: 'text', placeholder: '1:0' },
      { key: 'numSlaves', flag: '--num-slaves', label: 'Replica count range', type: 'text' },
      { key: 'waitTimeout', flag: '--wait-timeout', label: 'WAIT timeout range', type: 'text' },
    ],
  },
];

export const MEMTIER_ADVANCED_OPTIONS = MEMTIER_ADVANCED_OPTION_GROUPS.flatMap(
  (group) => group.options,
);

export const MEMTIER_ADVANCED_OPTION_BY_KEY = new Map(
  MEMTIER_ADVANCED_OPTIONS.map((option) => [option.key, option]),
);

function createValidationError(message) {
  const error = new Error(message);
  error.kind = 'validation';
  return error;
}

function isEnabledEntry(entry) {
  return Boolean(entry?.enabled);
}

function normalizeEntryValue(option, rawValue) {
  if (option.type === 'multiline') {
    return String(rawValue ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
  }

  if (option.type === 'integer') {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed)) {
      throw createValidationError(`${option.label} must be a whole number.`);
    }

    if (option.min !== undefined && parsed < option.min) {
      throw createValidationError(`${option.label} must be at least ${option.min}.`);
    }

    if (option.max !== undefined && parsed > option.max) {
      throw createValidationError(`${option.label} must be at most ${option.max}.`);
    }

    return parsed;
  }

  if (option.type === 'number') {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      throw createValidationError(`${option.label} must be a number.`);
    }

    if (option.min !== undefined && parsed < option.min) {
      throw createValidationError(`${option.label} must be at least ${option.min}.`);
    }

    if (option.max !== undefined && parsed > option.max) {
      throw createValidationError(`${option.label} must be at most ${option.max}.`);
    }

    return parsed;
  }

  if (option.type === 'select') {
    const normalized = String(rawValue ?? option.defaultValue ?? '').trim();
    if (!option.choices.some((choice) => choice.value === normalized)) {
      throw createValidationError(`${option.label} has an unsupported value.`);
    }

    return normalized;
  }

  return String(rawValue ?? '').trim();
}

export function normalizeMemtierAdvancedOptions(input = {}) {
  const normalized = {};

  for (const option of MEMTIER_ADVANCED_OPTIONS) {
    const rawEntry = input?.[option.key];
    if (!isEnabledEntry(rawEntry)) {
      continue;
    }

    if (option.type === 'boolean') {
      normalized[option.key] = { enabled: true };
      continue;
    }

    const value = normalizeEntryValue(option, rawEntry.value ?? option.defaultValue ?? '');
    if (value === '') {
      continue;
    }

    normalized[option.key] = {
      enabled: true,
      value,
    };
  }

  return normalized;
}

export function countEnabledMemtierAdvancedOptions(input = {}) {
  return Object.values(input ?? {}).filter(isEnabledEntry).length;
}

export function buildMemtierAdvancedArgs(input = {}) {
  const normalized = normalizeMemtierAdvancedOptions(input);
  const args = [];

  for (const option of MEMTIER_ADVANCED_OPTIONS) {
    const entry = normalized[option.key];
    if (!entry) {
      continue;
    }

    if (option.type === 'boolean') {
      args.push(option.flag);
      continue;
    }

    if (option.type === 'multiline') {
      String(entry.value)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          args.push(option.flag, line);
        });
      continue;
    }

    args.push(option.flag, String(entry.value));
  }

  return args;
}

export function getEnabledMemtierAdvancedFlags(input = {}) {
  const normalized = normalizeMemtierAdvancedOptions(input);

  return MEMTIER_ADVANCED_OPTIONS
    .filter((option) => normalized[option.key])
    .map((option) => option.flag);
}
