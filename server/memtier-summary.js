function parseMetricValue(value) {
  if (value === undefined || value === '---') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const configPatterns = [
  { regex: /^(\d+(?:\.\d+)?)\s+Threads$/i, key: 'threads' },
  {
    regex: /^(\d+(?:\.\d+)?)\s+Connections per thread$/i,
    key: 'connectionsPerThread',
  },
  { regex: /^(\d+(?:\.\d+)?)\s+Seconds$/i, key: 'seconds' },
];

const rowNames = new Set(['sets', 'gets', 'waits', 'totals']);
const distributionRowNames = new Map([
  ['set', { key: 'sets', label: 'Sets' }],
  ['get', { key: 'gets', label: 'Gets' }],
  ['wait', { key: 'waits', label: 'Waits' }],
]);

export function parseMemtierProgressPercent(line) {
  const match = String(line ?? '').match(/^\[RUN\s+#\d+\s+(\d+(?:\.\d+)?)%,/i);
  if (!match) {
    return null;
  }

  const progress = Number(match[1]);
  return Number.isFinite(progress) ? progress : null;
}

export function createEmptySummary() {
  return {
    config: {},
    results: {},
  };
}

export function applySummaryLine(summary, line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  for (const pattern of configPatterns) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      summary.config[pattern.key] = Number(match[1]);
      return true;
    }
  }

  const distributionParts = trimmed.split(/\s+/);
  if (distributionParts.length === 3) {
    const distributionRow = distributionRowNames.get(distributionParts[0].toLowerCase());
    const latency = parseMetricValue(distributionParts[1]);
    const percentile = parseMetricValue(distributionParts[2]);

    if (distributionRow && latency !== null && percentile !== null) {
      const result = summary.results[distributionRow.key] ?? { label: distributionRow.label };
      result.maxLatency = Math.max(result.maxLatency ?? 0, latency);
      summary.results[distributionRow.key] = result;

      const totals = summary.results.totals ?? { label: 'Totals' };
      totals.maxLatency = Math.max(totals.maxLatency ?? 0, latency);
      summary.results.totals = totals;

      return true;
    }
  }

  const parts = trimmed.split(/\s{2,}/);
  if (parts.length < 9) {
    return false;
  }

  const rowName = parts[0].toLowerCase();
  if (!rowNames.has(rowName)) {
    return false;
  }

  const hasP90Column = parts.length >= 10;

  summary.results[rowName] = {
    label: parts[0],
    opsSec: parseMetricValue(parts[1]),
    hitsSec: parseMetricValue(parts[2]),
    missesSec: parseMetricValue(parts[3]),
    avgLatency: parseMetricValue(parts[4]),
    p50Latency: parseMetricValue(parts[5]),
    p90Latency: hasP90Column ? parseMetricValue(parts[6]) : null,
    p99Latency: parseMetricValue(parts[hasP90Column ? 7 : 6]),
    p999Latency: parseMetricValue(parts[hasP90Column ? 8 : 7]),
    maxLatency: summary.results[rowName]?.maxLatency ?? null,
    kbSec: parseMetricValue(parts[hasP90Column ? 9 : 8]),
  };

  return true;
}
