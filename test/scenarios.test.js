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
