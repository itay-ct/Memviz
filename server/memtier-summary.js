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
    kbSec: parseMetricValue(parts[hasP90Column ? 9 : 8]),
  };

  return true;
}
