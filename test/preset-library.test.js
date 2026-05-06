import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePresetDocument } from '../server/preset-library.js';

test('normalizePresetDocument accepts mixed flat and staircase scenarios', () => {
  const preset = normalizePresetDocument(
    {
      name: 'general',
      label: 'General',
      tests: [
        {
          id: 'flat-cache',
          name: 'Flat Cache',
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
          },
        },
        {
          id: 'staircase-cache',
          name: 'Staircase Cache',
          kind: 'workload',
          defaults: {
            clients: 20,
            clientsStart: 4,
            clientsStep: 4,
            threads: 2,
            stepDuration: 10,
            staircaseEnabled: true,
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
          },
        },
      ],
      dataset_presets: [],
    },
    'general.preset.yaml',
  );

  assert.equal(preset.tests.length, 2);
  assert.equal(preset.tests[1].defaults.staircaseEnabled, true);
  assert.equal(preset.tests[1].defaults.clientsStart, 4);
});
