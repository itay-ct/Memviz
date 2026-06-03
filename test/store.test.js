import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearConnections,
  clearRuns,
  createConnection,
  createRun,
  finishRun,
  getConnection,
  recordMetric,
  serializeRun,
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

test('recordMetric ignores metric updates after a run has failed', () => {
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
  recordMetric(run.id, {
    metric: 'ops_sec',
    value: 1000,
    timestamp: '2026-05-28T00:00:02.000Z',
  });

  assert.equal(run.metrics.progress_pct, 0);
  assert.equal(run.metrics.ops_sec, null);
  assert.deepEqual(run.series.ops_sec, []);
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

test('connection database source is preserved on serialized runs', () => {
  clearConnections();
  clearRuns();

  const publicConnection = createConnection({
    id: 'redis-cloud-valkey',
    name: 'Redis Cloud Valkey',
    target: connection.target,
    databaseSource: {
      engine: 'valkey',
      service: 'redis-cloud',
    },
    databaseVersion: '8.0.1',
  });
  const storedConnection = getConnection(publicConnection.id);
  const run = createRun({
    id: 'run-4',
    label: 'run-4',
    scenario,
    connection: storedConnection,
    command: 'memtier_benchmark',
  });

  assert.deepEqual(publicConnection.databaseSource, {
    engine: 'valkey',
    service: 'redis-cloud',
  });
  assert.equal(publicConnection.databaseVersion, '8.0.1');
  const serializedRun = serializeRun(run, { includeLogs: false });
  assert.deepEqual(serializedRun.databaseSource, {
    engine: 'valkey',
    service: 'redis-cloud',
  });
  assert.equal(serializedRun.databaseVersion, '8.0.1');
});
