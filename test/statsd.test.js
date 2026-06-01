import test from 'node:test';
import assert from 'node:assert/strict';

import { parseStatsdLine } from '../server/statsd.js';

const runLabel = '123e4567-e89b-42d3-a456-426614174000';

test('parseStatsdLine parses standard memviz metrics', () => {
  const parsed = parseStatsdLine(`memviz.${runLabel}.latency_p50:1.23|g`);

  assert.equal(parsed?.prefix, 'memviz');
  assert.equal(parsed?.runLabel, runLabel);
  assert.equal(parsed?.metric, 'latency_p50');
  assert.equal(parsed?.value, 1.23);
  assert.equal(parsed?.type, 'g');
  assert.equal(parsed?.raw, `memviz.${runLabel}.latency_p50:1.23|g`);
  assert.ok(parsed?.timestamp);
});

test('parseStatsdLine finds run labels before cluster-specific segments', () => {
  const parsed = parseStatsdLine(`memviz.${runLabel}.node-0.latency_p50:2.5|g`);

  assert.equal(parsed?.prefix, 'memviz');
  assert.equal(parsed?.runLabel, runLabel);
  assert.equal(parsed?.metric, 'latency_p50');
  assert.equal(parsed?.value, 2.5);
});

test('parseStatsdLine finds run labels after cluster-specific segments', () => {
  const parsed = parseStatsdLine(`memviz.node-0.${runLabel}.latency_avg_ms:3.5|g`);

  assert.equal(parsed?.prefix, 'memviz.node-0');
  assert.equal(parsed?.runLabel, runLabel);
  assert.equal(parsed?.metric, 'latency_avg_ms');
  assert.equal(parsed?.value, 3.5);
});
