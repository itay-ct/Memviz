import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applySummaryLine,
  createEmptySummary,
  parseMemtierProgressPercent,
} from '../server/memtier-summary.js';

test('parseMemtierProgressPercent reads memtier run progress lines', () => {
  assert.equal(
    parseMemtierProgressPercent(
      '[RUN #1 20%,   1 secs]  1 threads  1 conns:        4961 ops',
    ),
    20,
  );
  assert.equal(
    parseMemtierProgressPercent(
      '[RUN #1 100%,   5 secs]  0 threads  1 conns:       25275 ops',
    ),
    100,
  );
});

test('parseMemtierProgressPercent ignores non-progress lines', () => {
  assert.equal(parseMemtierProgressPercent('Writing results to stdout'), null);
});

test('applySummaryLine preserves memtier latency tail maximums', () => {
  const summary = createEmptySummary();

  assert.equal(
    applySummaryLine(
      summary,
      [
        'Totals      53424.18      4641.62     46229.54        35.28061',
        '        5.05500         7.03900        10.17500        17.15100      2332.25 ',
      ].join(''),
    ),
    true,
  );
  assert.equal(applySummaryLine(summary, 'GET      36.863       99.995'), true);
  assert.equal(applySummaryLine(summary, 'GET    603979.750      100.000'), true);

  assert.equal(summary.results.gets.maxLatency, 603979.75);
  assert.equal(summary.results.totals.avgLatency, 35.28061);
  assert.equal(summary.results.totals.p999Latency, 17.151);
  assert.equal(summary.results.totals.maxLatency, 603979.75);
});
