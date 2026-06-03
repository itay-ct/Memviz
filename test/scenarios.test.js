import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMemtierArgsFromConfig,
  normalizeScenarioConfig,
  normalizeScenarioDefinition,
} from '../server/scenarios.js';

function createScenarioDefinition(overrides = {}) {
  return normalizeScenarioDefinition({
    id: 'read-heavy-cache-sweep',
    name: 'Read Heavy Cache Sweep',
    kind: 'workload',
    defaults: {
      clients: 20,
      threads: 2,
      testTime: 30,
      limitMode: 'time',
      requestCount: 1000,
      rateLimitEnabled: false,
      rateLimit: 20000,
      pipeline: 1,
      keyPrefix: 'memtier-',
      setRatio: 1,
      getRatio: 10,
      dataSize: 32,
      ...overrides,
    },
  });
}

function createCommandScenarioDefinition(overrides = {}) {
  return normalizeScenarioDefinition({
    id: 'wide-random-read',
    name: 'Wide Random Read',
    kind: 'command',
    defaults: {
      clients: 20,
      threads: 2,
      testTime: 30,
      limitMode: 'time',
      requestCount: 1000,
      rateLimitEnabled: false,
      rateLimit: 20000,
      pipeline: 64,
      keyPrefix: 'flex:data:',
      keyMinimum: 1,
      keyMaximum: 1000,
      commandKeyPattern: 'R',
      distinctClientSeed: true,
      command: 'GET __key__',
      ...overrides,
    },
  });
}

test('normalizeScenarioDefinition rejects partial staircase defaults', () => {
  assert.throws(
    () =>
      createScenarioDefinition({
        staircaseEnabled: true,
        clientsStart: 5,
        clientsStep: 5,
      }),
    /requires clientsStart, clientsStep, and stepDuration together/i,
  );
});

test('normalizeScenarioDefinition rejects staircase defaults for request mode', () => {
  assert.throws(
    () =>
      createScenarioDefinition({
        staircaseEnabled: true,
        clientsStart: 5,
        clientsStep: 5,
        stepDuration: 10,
        limitMode: 'requests',
      }),
    /only works with time-based runs/i,
  );
});

test('normalizeScenarioDefinition rejects staircase defaults when start matches target', () => {
  assert.throws(
    () =>
      createScenarioDefinition({
        staircaseEnabled: true,
        clientsStart: 20,
        clientsStep: 5,
        stepDuration: 10,
      }),
    /must stay below the final clients \/ thread target/i,
  );
});

test('normalizeScenarioConfig accepts valid staircase config', () => {
  const scenario = createScenarioDefinition({
    staircaseEnabled: true,
    clientsStart: 4,
    clientsStep: 4,
    stepDuration: 10,
  });

  const config = normalizeScenarioConfig(scenario, {
    staircaseEnabled: true,
    clients: 20,
    clientsStart: 4,
    clientsStep: 4,
    stepDuration: 10,
  });

  assert.equal(config.staircaseEnabled, true);
  assert.equal(config.clientsStart, 4);
  assert.equal(config.clientsStep, 4);
  assert.equal(config.stepDuration, 10);
});

test('normalizeScenarioConfig accepts cluster mode config', () => {
  const scenario = createScenarioDefinition();
  const config = normalizeScenarioConfig(scenario, {
    clusterModeEnabled: true,
  });

  assert.equal(config.clusterModeEnabled, true);
});

test('buildMemtierArgsFromConfig keeps flat runs unchanged', () => {
  const scenario = createScenarioDefinition();
  const config = normalizeScenarioConfig(scenario, {});

  assert.deepEqual(buildMemtierArgsFromConfig(scenario, config), [
    '--clients',
    '20',
    '--threads',
    '2',
    '--pipeline',
    '1',
    '--print-percentiles',
    '50,90,99,99.9',
    '--key-prefix',
    'memtier-',
    '--ratio',
    '1:10',
    '--data-size',
    '32',
    '--test-time',
    '30',
  ]);
});

test('buildMemtierArgsFromConfig includes cluster mode flag when enabled', () => {
  const scenario = createScenarioDefinition();
  const config = normalizeScenarioConfig(scenario, {
    clusterModeEnabled: true,
  });

  assert.deepEqual(buildMemtierArgsFromConfig(scenario, config), [
    '--clients',
    '20',
    '--threads',
    '2',
    '--pipeline',
    '1',
    '--print-percentiles',
    '50,90,99,99.9',
    '--key-prefix',
    'memtier-',
    '--cluster-mode',
    '--ratio',
    '1:10',
    '--data-size',
    '32',
    '--test-time',
    '30',
  ]);
});

test('buildMemtierArgsFromConfig includes advanced memtier parameters', () => {
  const scenario = createScenarioDefinition();
  const config = normalizeScenarioConfig(scenario, {
    memtierAdvanced: {
      hideHistogram: { enabled: true },
      printPercentiles: { enabled: true, value: '50,95,99,99.9' },
      commandStatsBreakdown: { enabled: true, value: 'line' },
      commands: { enabled: true, value: 'PING\nGET __key__' },
      keyMaximum: { enabled: true, value: 1000 },
    },
  });

  assert.deepEqual(buildMemtierArgsFromConfig(scenario, config).slice(-11), [
    '--hide-histogram',
    '--print-percentiles',
    '50,95,99,99.9',
    '--command-stats-breakdown',
    'line',
    '--command',
    'PING',
    '--command',
    'GET __key__',
    '--key-maximum',
    '1000',
  ]);
});

test('buildMemtierArgsFromConfig includes staircase args in order', () => {
  const scenario = createScenarioDefinition({
    staircaseEnabled: true,
    clientsStart: 4,
    clientsStep: 4,
    stepDuration: 10,
  });
  const config = normalizeScenarioConfig(scenario, {});

  assert.deepEqual(buildMemtierArgsFromConfig(scenario, config), [
    '--clients',
    '20',
    '--threads',
    '2',
    '--pipeline',
    '1',
    '--print-percentiles',
    '50,90,99,99.9',
    '--key-prefix',
    'memtier-',
    '--ratio',
    '1:10',
    '--data-size',
    '32',
    '--test-time',
    '30',
    '--clients-start',
    '4',
    '--clients-step',
    '4',
    '--step-duration',
    '10',
  ]);
});

test('buildMemtierArgsFromConfig includes command key range and pattern args', () => {
  const scenario = createCommandScenarioDefinition();
  const config = normalizeScenarioConfig(scenario, {});

  assert.deepEqual(buildMemtierArgsFromConfig(scenario, config), [
    '--clients',
    '20',
    '--threads',
    '2',
    '--pipeline',
    '64',
    '--print-percentiles',
    '50,90,99,99.9',
    '--key-prefix',
    'flex:data:',
    '--key-minimum',
    '1',
    '--key-maximum',
    '1000',
    '--command',
    'GET __key__',
    '--command-stats-breakdown',
    'line',
    '--command-key-pattern',
    'R',
    '--test-time',
    '30',
    '--distinct-client-seed',
  ]);
});

test('normalizeScenarioDefinition rejects inverted key ranges', () => {
  assert.throws(
    () =>
      createCommandScenarioDefinition({
        keyMinimum: 200,
        keyMaximum: 100,
      }),
    /key minimum must be less than or equal to key maximum/i,
  );
});
