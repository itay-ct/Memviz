function formatCompactInteger(value) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  }

  return String(value);
}

function formatCommandPreview(command) {
  const compact = String(command ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (compact.length <= 66) {
    return compact;
  }

  return `${compact.slice(0, 63)}...`;
}

const sharedLimits = {
  clients: { min: 1, max: 200, step: 1, label: 'Clients / thread' },
  threads: { min: 1, max: 16, step: 1, label: 'Threads' },
  testTime: { min: 5, max: 300, step: 5, label: 'Seconds' },
  requestCount: { min: 1, max: 1000000, step: 100, label: 'Requests / client' },
  rateLimit: { min: 1000, max: 100000, step: 1000, label: 'Rate limit / sec' },
  pipeline: { min: 1, max: 500, step: 1, label: 'Pipeline' },
  setRatio: { min: 1, max: 20, step: 1, label: 'Set ratio' },
  getRatio: { min: 1, max: 100, step: 1, label: 'Get ratio' },
  dataSize: { min: 16, max: 8192, step: 16, label: 'Value bytes' },
};

function buildScenarioLimits(kind) {
  const limits = {
    clients: sharedLimits.clients,
    threads: sharedLimits.threads,
    testTime: sharedLimits.testTime,
    requestCount: sharedLimits.requestCount,
    rateLimit: sharedLimits.rateLimit,
    pipeline: sharedLimits.pipeline,
  };

  if (kind === 'workload') {
    limits.setRatio = sharedLimits.setRatio;
    limits.getRatio = sharedLimits.getRatio;
    limits.dataSize = sharedLimits.dataSize;
  }

  return limits;
}

function scenarioDescription(config, kind) {
  const durationLabel =
    config.limitMode === 'requests'
      ? `${formatCompactInteger(config.requestCount)} requests/client`
      : `${config.testTime}s`;
  const rateLimitLabel = config.rateLimitEnabled
    ? `cap ${formatCompactInteger(config.rateLimit)}/s`
    : null;

  const shapeLabel =
    kind === 'command'
      ? formatCommandPreview(config.command)
      : `${config.setRatio}:${config.getRatio} mix • ${config.dataSize} B`;

  return [
    `${config.clients} clients/thread`,
    `${config.threads} threads`,
    durationLabel,
    `pipe ${config.pipeline}`,
    `prefix ${config.keyPrefix}`,
    shapeLabel,
    rateLimitLabel,
  ]
    .filter(Boolean)
    .join(' • ');
}

function createValidationError(message) {
  const error = new Error(message);
  error.kind = 'validation';
  return error;
}

function normalizeInteger(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw createValidationError('Scenario values must be whole numbers.');
  }

  return parsed;
}

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw createValidationError('Boolean scenario values must be true or false.');
}

function normalizeString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function normalizeOptionalInteger(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw createValidationError('Estimated ops/sec must be a number.');
  }

  return Math.max(0, Math.round(parsed));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeString(entry).trim())
        .filter(Boolean),
    ),
  );
}

function requireNonEmptyString(value, message) {
  const normalized = normalizeString(value).trim();
  if (!normalized) {
    throw createValidationError(message);
  }

  return normalized;
}

function escapeTagValue(value) {
  return String(value ?? '').replace(/([@.])/g, '\\$1');
}

function normalizeSearchCommandSyntax(command) {
  const trimmed = String(command ?? '').trim();
  if (!/^FT\.(SEARCH|AGGREGATE)\b/i.test(trimmed)) {
    return trimmed;
  }

  const withoutQuotedEmailToken = trimmed.replace(/"(@email:\{[^"}]+\})"/gi, '$1');

  return withoutQuotedEmailToken.replace(/(@email:\{)([^}]+)(\})/gi, (_match, prefix, rawValue, suffix) => {
    const normalizedValue = rawValue.replace(/\\([@.])/g, '$1');
    return `${prefix}${escapeTagValue(normalizedValue)}${suffix}`;
  });
}

function validateScenarioDefaults(kind, defaults, limits) {
  if (!['time', 'requests'].includes(defaults.limitMode)) {
    throw createValidationError('Run mode must be time or requests.');
  }

  for (const [key, constraints] of Object.entries(limits)) {
    const value = defaults[key];
    if (!Number.isInteger(value)) {
      throw createValidationError(`${constraints.label} must be a whole number.`);
    }

    if (value < constraints.min || value > constraints.max) {
      throw createValidationError(
        `${constraints.label} must stay between ${constraints.min} and ${constraints.max}.`,
      );
    }
  }

  if (!defaults.keyPrefix) {
    throw createValidationError('Key prefix is required.');
  }

  if (kind === 'command' && !defaults.command) {
    throw createValidationError('Command is required.');
  }
}

export function normalizeScenarioDefinition(input = {}) {
  const kind = requireNonEmptyString(input.kind ?? 'workload', 'Scenario kind is required.');
  if (!['workload', 'command'].includes(kind)) {
    throw createValidationError('Scenario kind must be workload or command.');
  }

  const limits = buildScenarioLimits(kind);
  const rawDefaults = input.defaults ?? {};
  const defaults = {
    clients: normalizeInteger(rawDefaults.clients, 1),
    threads: normalizeInteger(rawDefaults.threads, 1),
    testTime: normalizeInteger(rawDefaults.testTime, 20),
    limitMode: normalizeString(rawDefaults.limitMode, 'time').trim() || 'time',
    requestCount: normalizeInteger(rawDefaults.requestCount, 150000),
    rateLimitEnabled: normalizeBoolean(rawDefaults.rateLimitEnabled, false),
    rateLimit: normalizeInteger(rawDefaults.rateLimit, 20000),
    pipeline: normalizeInteger(rawDefaults.pipeline, 1),
    keyPrefix: requireNonEmptyString(rawDefaults.keyPrefix ?? 'memtier-', 'Key prefix is required.'),
  };

  if (kind === 'command') {
    defaults.command = normalizeSearchCommandSyntax(
      requireNonEmptyString(rawDefaults.command, 'Command is required.'),
    );
  } else {
    defaults.setRatio = normalizeInteger(rawDefaults.setRatio, 1);
    defaults.getRatio = normalizeInteger(rawDefaults.getRatio, 10);
    defaults.dataSize = normalizeInteger(rawDefaults.dataSize, 32);
  }

  validateScenarioDefaults(kind, defaults, limits);

  return {
    id: requireNonEmptyString(input.id, 'Scenario id is required.'),
    name: requireNonEmptyString(input.name, 'Scenario name is required.'),
    kind,
    defaults,
    limits,
    estimatedOpsPerSec: normalizeOptionalInteger(
      input.estimated_ops_per_sec ?? input.estimatedOpsPerSec,
      null,
    ),
    requiredIndexes: normalizeStringArray(input.required_indexes ?? input.requiredIndexes),
    suggestedDatasetPresetId: normalizeString(
      input.suggested_dataset_preset_id ?? input.suggestedDatasetPresetId,
      '',
    ).trim() || null,
    description: scenarioDescription(defaults, kind),
  };
}

export function normalizeScenarioConfig(scenario, input = {}) {
  const config = {
    limitMode: input.limitMode ?? scenario.defaults.limitMode ?? 'time',
    rateLimitEnabled: normalizeBoolean(
      input.rateLimitEnabled,
      scenario.defaults.rateLimitEnabled ?? false,
    ),
    keyPrefix: normalizeString(input.keyPrefix, scenario.defaults.keyPrefix).trim(),
  };

  if (scenario.kind === 'command') {
    config.command = normalizeSearchCommandSyntax(
      normalizeString(input.command, scenario.defaults.command),
    );
  }

  if (!['time', 'requests'].includes(config.limitMode)) {
    throw createValidationError('Run mode must be time or requests.');
  }

  for (const [key, constraints] of Object.entries(scenario.limits)) {
    const value = normalizeInteger(input[key], scenario.defaults[key]);
    if (value < constraints.min || value > constraints.max) {
      throw createValidationError(
        `${constraints.label} must stay between ${constraints.min} and ${constraints.max}.`,
      );
    }

    config[key] = value;
  }

  if (!config.keyPrefix) {
    throw createValidationError('Key prefix is required.');
  }

  if (scenario.kind === 'command' && !config.command) {
    throw createValidationError('Command is required.');
  }

  return config;
}

export function buildMemtierArgsFromConfig(scenario, config) {
  const args = [
    '--clients',
    String(config.clients),
    '--threads',
    String(config.threads),
    '--pipeline',
    String(config.pipeline),
    '--print-percentiles',
    '50,90,99,99.9',
    '--key-prefix',
    config.keyPrefix,
  ];

  if (scenario.kind === 'command') {
    args.push('--command', config.command, '--command-stats-breakdown', 'line');
  } else {
    args.push(
      '--ratio',
      `${config.setRatio}:${config.getRatio}`,
      '--data-size',
      String(config.dataSize),
    );
  }

  if (config.limitMode === 'requests') {
    args.push('--requests', String(config.requestCount));
  } else {
    args.push('--test-time', String(config.testTime));
  }

  if (config.rateLimitEnabled) {
    args.push('--rate-limiting', String(config.rateLimit));
  }

  return args;
}

export function buildRunnableScenario(scenario, input = {}) {
  const config = normalizeScenarioConfig(scenario, input);

  return {
    ...scenario,
    config,
    description: scenarioDescription(config, scenario.kind),
    memtierArgs: buildMemtierArgsFromConfig(scenario, config),
  };
}
