import test from 'node:test';
import assert from 'node:assert/strict';

import { applyScenarioDraftConfigChange } from '../src/scenarioDraftConfig.js';
import { formatLoadProfileSummary } from '../shared/scenario-load-profile.js';

const scenario = {
  defaults: {
    clientsStart: 4,
    clientsStep: 4,
    stepDuration: 10,
  },
  limits: {
    clients: { min: 1, max: 200 },
    clientsStart: { min: 1, max: 200 },
    clientsStep: { min: 1, max: 200 },
    stepDuration: { min: 1, max: 300 },
    keyMinimum: { min: 0, max: 1000000000 },
    keyMaximum: { min: 0, max: 1000000000 },
  },
};

test('enabling staircase seeds the staircase controls', () => {
  const nextConfig = applyScenarioDraftConfigChange(
    {
      clients: 20,
      limitMode: 'time',
      staircaseEnabled: false,
      testTime: 30,
    },
    scenario,
    'staircaseEnabled',
    true,
  );

  assert.equal(nextConfig.staircaseEnabled, true);
  assert.equal(nextConfig.clientsStart, 4);
  assert.equal(nextConfig.clientsStep, 4);
  assert.equal(nextConfig.stepDuration, 10);
  assert.equal(nextConfig.testTime, 40);
});

test('switching to request mode disables staircase', () => {
  const nextConfig = applyScenarioDraftConfigChange(
    {
      clients: 20,
      limitMode: 'time',
      staircaseEnabled: true,
      clientsStart: 4,
      clientsStep: 4,
      stepDuration: 10,
    },
    scenario,
    'limitMode',
    'requests',
  );

  assert.equal(nextConfig.limitMode, 'requests');
  assert.equal(nextConfig.staircaseEnabled, false);
});

test('toggling cluster mode updates the draft config', () => {
  const nextConfig = applyScenarioDraftConfigChange(
    {
      clusterModeEnabled: false,
    },
    scenario,
    'clusterModeEnabled',
    true,
  );

  assert.equal(nextConfig.clusterModeEnabled, true);
});

test('updating memtier advanced options preserves structured entries', () => {
  const nextConfig = applyScenarioDraftConfigChange(
    {
      memtierAdvanced: {},
    },
    scenario,
    'memtierAdvanced',
    {
      hideHistogram: { enabled: true },
    },
  );

  assert.deepEqual(nextConfig.memtierAdvanced, {
    hideHistogram: { enabled: true },
  });
});

test('shrinking final clients keeps staircase start below target', () => {
  const nextConfig = applyScenarioDraftConfigChange(
    {
      clients: 20,
      limitMode: 'time',
      staircaseEnabled: true,
      clientsStart: 8,
      clientsStep: 4,
      stepDuration: 10,
    },
    scenario,
    'clients',
    6,
  );

  assert.equal(nextConfig.clients, 6);
  assert.equal(nextConfig.clientsStart, 5);
});

test('raising key minimum keeps key range valid', () => {
  const nextConfig = applyScenarioDraftConfigChange(
    {
      keyMinimum: 1,
      keyMaximum: 100,
    },
    scenario,
    'keyMinimum',
    200,
  );

  assert.equal(nextConfig.keyMinimum, 200);
  assert.equal(nextConfig.keyMaximum, 200);
});

test('load profile summary includes staircase wording', () => {
  assert.equal(
    formatLoadProfileSummary({
      staircaseEnabled: true,
      clients: 20,
      clientsStart: 4,
      clientsStep: 4,
      stepDuration: 10,
    }),
    'staircase 4→20 clients/thread (+4 every 10s)',
  );
});
