import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearRuns,
  createRun,
  finishRun,
  recordMetric,
} from '../server/store.js';

const connection = {
  id: 'local',
  name: '127.0.0.1:6379',
  target: {
    host: '127.0.0.1',
    port: 6379,
    username: 'default',
    password: '',
    tls: false,
    db: 0,
    hasAuth: false,
    mode: 'hostport',
    summary: '127.0.0.1:6379',
  },
};

const scenario = {
  id: 'read-heavy-cache-sweep',
  name: 'Read Heavy Cache Sweep',
  description: 'test scenario',
  config: {},
};

test('recordMetric keeps benchmark progress monotonic', () => {
  clearRuns();
  const run = createRun({
    id: 'run-1',
    label: 'run-1',
    scenario,
    connection,
    command: 'memtier_benchmark',
  });

  recordMetric(run.id, {
    metric: 'progress_pct',
    value: 40,
    timestamp: '2026-05-28T00:00:00.000Z',
  });
  recordMetric(run.id, {
    metric: 'progress_pct',
    value: 0,
    timestamp: '2026-05-28T00:00:01.000Z',
  });

  assert.equal(run.metrics.progress_pct, 40);
});

test('recordMetric ignores progress updates after a run has failed', () => {
  clearRuns();
  const run = createRun({
    id: 'run-2',
    label: 'run-2',
    scenario,
    connection,
    command: 'memtier_benchmark',
  });

  finishRun(run.id, {
    status: 'failed',
    error: 'Cluster Aware requires a Redis Cluster target.',
  });
  recordMetric(run.id, {
    metric: 'progress_pct',
    value: 100,
    timestamp: '2026-05-28T00:00:01.000Z',
  });

  assert.equal(run.metrics.progress_pct, 0);
});

test('recordMetric keeps nonzero latency when a terminal reset reports zero', () => {
  clearRuns();
  const run = createRun({
    id: 'run-3',
    label: 'run-3',
    scenario,
    connection,
    command: 'memtier_benchmark',
  });

  recordMetric(run.id, {
    metric: 'latency_p50',
    value: 1.25,
    timestamp: '2026-05-28T00:00:00.000Z',
  });
  recordMetric(run.id, {
    metric: 'latency_p50',
    value: 0,
    timestamp: '2026-05-28T00:00:01.000Z',
  });

  assert.equal(run.metrics.latency_p50, 1.25);
  assert.deepEqual(run.series.latency_p50, [
    {
      timestamp: '2026-05-28T00:00:00.000Z',
      value: 1.25,
    },
  ]);
});
