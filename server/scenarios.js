function formatCompactInteger(value) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  }

  return String(value);
}

function scenarioDescription(config) {
  const durationLabel =
    config.limitMode === 'requests'
      ? `${formatCompactInteger(config.requestCount)} requests/client`
      : `${config.testTime}s`;
  const rateLimitLabel = config.rateLimitEnabled
    ? `cap ${formatCompactInteger(config.rateLimit)}/s`
    : null;

  return [
    `${config.clients} clients/thread`,
    `${config.threads} threads`,
    durationLabel,
    `${config.setRatio}:${config.getRatio} ratio`,
    `${config.dataSize}B values`,
    `pipe ${config.pipeline}`,
    rateLimitLabel,
  ]
    .filter(Boolean)
    .join(' • ');
}

const sharedLimits = {
  clients: { min: 1, max: 200, step: 1, label: 'Clients / thread' },
  threads: { min: 1, max: 16, step: 1, label: 'Threads' },
  testTime: { min: 5, max: 300, step: 5, label: 'Seconds' },
  requestCount: { min: 1000, max: 1000000, step: 1000, label: 'Requests / client' },
  setRatio: { min: 0, max: 20, step: 1, label: 'Set ratio' },
  getRatio: { min: 0, max: 20, step: 1, label: 'Get ratio' },
  dataSize: { min: 8, max: 4096, step: 8, label: 'Value bytes' },
  rateLimit: { min: 1000, max: 100000, step: 1000, label: 'Rate limit / sec' },
  pipeline: { min: 1, max: 100, step: 1, label: 'Pipeline' },
};

function createScenario(id, name, defaults) {
  return {
    id,
    name,
    defaults,
    limits: sharedLimits,
    description: scenarioDescription(defaults),
  };
}

export const scenarios = [
  createScenario('baseline-redis-load', 'Baseline Redis Load', {
    clients: 50,
    threads: 4,
    testTime: 15,
    limitMode: 'time',
    requestCount: 150000,
    setRatio: 1,
    getRatio: 10,
    dataSize: 32,
    rateLimitEnabled: false,
    rateLimit: 20000,
    pipeline: 1,
  }),
  createScenario('read-heavy-cache-sweep', 'Read Heavy Cache Sweep', {
    clients: 70,
    threads: 4,
    testTime: 15,
    limitMode: 'time',
    requestCount: 150000,
    setRatio: 1,
    getRatio: 20,
    dataSize: 32,
    rateLimitEnabled: false,
    rateLimit: 20000,
    pipeline: 1,
  }),
  createScenario('write-heavy-session-churn', 'Write Heavy Session Churn', {
    clients: 40,
    threads: 4,
    testTime: 15,
    limitMode: 'time',
    requestCount: 150000,
    setRatio: 4,
    getRatio: 1,
    dataSize: 64,
    rateLimitEnabled: false,
    rateLimit: 20000,
    pipeline: 1,
  }),
  createScenario('large-payload-throughput', 'Large Payload Throughput', {
    clients: 30,
    threads: 4,
    testTime: 15,
    limitMode: 'time',
    requestCount: 150000,
    setRatio: 1,
    getRatio: 10,
    dataSize: 512,
    rateLimitEnabled: false,
    rateLimit: 20000,
    pipeline: 1,
  }),
];

const scenarioMap = new Map(scenarios.map((scenario) => [scenario.id, scenario]));

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

export function getScenarioById(id) {
  return scenarioMap.get(id);
}

export function normalizeScenarioConfig(scenario, input = {}) {
  const config = {
    limitMode: input.limitMode ?? scenario.defaults.limitMode ?? 'time',
    rateLimitEnabled: normalizeBoolean(
      input.rateLimitEnabled,
      scenario.defaults.rateLimitEnabled ?? false,
    ),
  };

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

  if (config.setRatio === 0 && config.getRatio === 0) {
    throw createValidationError('Set and get ratio cannot both be zero.');
  }

  return config;
}

export function buildMemtierArgsFromConfig(config) {
  const args = [
    '--clients',
    String(config.clients),
    '--threads',
    String(config.threads),
    '--ratio',
    `${config.setRatio}:${config.getRatio}`,
    '--data-size',
    String(config.dataSize),
    '--pipeline',
    String(config.pipeline),
    '--print-percentiles',
    '50,90,99,99.9',
  ];

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
    description: scenarioDescription(config),
    memtierArgs: buildMemtierArgsFromConfig(config),
  };
}
