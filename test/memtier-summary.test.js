import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMemtierProgressPercent } from '../server/memtier-summary.js';

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
