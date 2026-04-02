import {
  Fragment,
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dashboardIconWhite from './assets/icons/redis/dashboard-white.svg';
import analysisIconMidnight from './assets/icons/redis/analysis-midnight.svg';
import cliIconMidnight from './assets/icons/redis/cli-midnight.svg';
import databaseDuotoneIcon from './assets/icons/redis/database-duotone.svg';
import databaseWhiteIcon from './assets/icons/redis/database-white.svg';
import editIconMidnight from './assets/icons/redis/edit-midnight.svg';
import integratedModulesIconMidnight from './assets/icons/redis/integrated-modules-midnight.svg';
import latencyIconWhite from './assets/icons/redis/latency-white.svg';
import meteringIconMidnight from './assets/icons/redis/metering-midnight.svg';
import pipelineIconWhite from './assets/icons/redis/pipeline-white.svg';
import redisInsightIconDuotone from './assets/icons/redis/redis-insight-duotone.svg';
import settingsIconMidnight from './assets/icons/redis/settings-midnight.svg';
import settingsIconWhite from './assets/icons/redis/settings-white.svg';

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="check-icon" viewBox="0 0 16 16">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg aria-hidden="true" className="warning-icon" viewBox="0 0 16 16">
      <path
        d="M8 2.1 14 13.2H2L8 2.1Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path
        d="M8 5.7v3.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="11.7" r="0.8" fill="currentColor" />
    </svg>
  );
}

const DEFAULT_FORM = {
  hostOrUrl: '127.0.0.1',
  port: '6379',
  username: 'default',
  password: '',
};

const BLANK_CONNECTION_FORM = {
  hostOrUrl: '',
  port: '',
  username: '',
  password: '',
};

const EMPTY_APP_STATE = {
  connections: [],
  selectedConnectionId: null,
  activeRunIds: [],
  runs: [],
  scenarios: [],
};

const EMPTY_META = {
  appVersion: '1.0.0',
  appPort: 3000,
  appUrl: 'http://127.0.0.1:3000',
  memtier: {
    version: null,
    minimumVersion: '2.3.0',
    repoUrl: 'https://github.com/RedisLabs/memtier_benchmark',
  },
};

const EMPTY_SETUP_STATE = {
  status: 'idle',
  progress: 0,
  message: 'Waiting to prepare memtier.',
  error: null,
  runtimeKind: null,
  version: null,
  minimumVersion: '2.3.0',
  repoUrl: 'https://github.com/RedisLabs/memtier_benchmark',
  appPort: 3000,
  appUrl: 'http://127.0.0.1:3000',
  steps: [],
  logs: [],
};

const COMPARE_CHART_COLORS = ['#81DBFF', '#C895E3', '#DDFF21'];

function upsertRun(runs, nextRun) {
  const existingRunIndex = runs.findIndex((run) => run.id === nextRun.id);
  if (existingRunIndex === -1) {
    return [...runs, nextRun];
  }

  const updatedRuns = [...runs];
  updatedRuns[existingRunIndex] = nextRun;
  return updatedRuns;
}

function getActiveRunIdsFromRuns(runs) {
  return runs.filter((run) => run.status === 'running').map((run) => run.id);
}

function reduceSocketMessage(state, message) {
  if (message.type === 'snapshot') {
    return {
      connections: message.state.connections ?? [],
      selectedConnectionId: message.state.selectedConnectionId ?? null,
      activeRunIds: message.state.activeRunIds ?? getActiveRunIdsFromRuns(message.state.runs ?? []),
      runs: message.state.runs,
      scenarios: message.scenarios,
    };
  }

  if (message.type === 'run_started') {
    const runs = upsertRun(state.runs, message.run);
    return {
      ...state,
      activeRunIds: getActiveRunIdsFromRuns(runs),
      runs,
    };
  }

  if (message.type === 'metric') {
    return {
      ...state,
      runs: state.runs.map((run) =>
        run.id === message.runId
          ? {
              ...run,
              metrics: message.metrics,
              series: message.series,
            }
          : run,
      ),
    };
  }

  if (message.type === 'log') {
    return {
      ...state,
      runs: state.runs.map((run) => {
        if (run.id !== message.runId) {
          return run;
        }

        const logs = [...run.logs, message.entry];
        if (logs.length > 600) {
          logs.splice(0, logs.length - 600);
        }

        return {
          ...run,
          logs,
        };
      }),
    };
  }

  if (message.type === 'run_finished') {
    const runs = upsertRun(state.runs, message.run);
    return {
      ...state,
      activeRunIds: getActiveRunIdsFromRuns(runs),
      runs,
    };
  }

  return state;
}

function validateConnectionForm(formState) {
  const hostOrUrl = formState.hostOrUrl.trim();

  if (!hostOrUrl) {
    return 'Enter a Redis host or URL.';
  }

  if (hostOrUrl.includes('://')) {
    try {
      const parsedUrl = new URL(hostOrUrl);

      if (!['redis:', 'rediss:'].includes(parsedUrl.protocol)) {
        return 'Redis URLs must use redis:// or rediss://.';
      }

      if (!parsedUrl.hostname) {
        return 'Redis URL must include a host.';
      }

      return '';
    } catch {
      return 'Enter a valid Redis URL.';
    }
  }

  const port = Number(formState.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return 'Enter a valid Redis port.';
  }

  return '';
}

function clampValue(value, limits) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return limits.min;
  }

  return Math.max(limits.min, Math.min(limits.max, numericValue));
}

function formatMetric(value, formatter) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  return formatter(value);
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: value < 100 ? 1 : 0,
  }).format(value);
}

function formatCompactInteger(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  }

  return `${Math.round(value)}`;
}

function formatOpsPerSecond(value) {
  return `${formatCompactNumber(value)} ops/s`;
}

function formatRateLimit(value) {
  return `${formatCompactInteger(value)}/s`;
}

function formatBytesPerSecond(value) {
  if (value < 1024) {
    return `${Math.round(value)} B/s`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB/s`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatKilobytesPerSecond(value) {
  return `${value.toFixed(value >= 100 ? 0 : 1)} KB/s`;
}

function formatLatency(value) {
  return `${value.toFixed(value >= 100 ? 0 : 2)} ms`;
}

function formatConnections(value) {
  return `${Math.round(value)}`;
}

function formatRtt(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ms`;
}

function getConnectionStatusTooltip(connection) {
  if (connection.rttMs === null || connection.rttMs === undefined) {
    return 'Round trip time: measuring...';
  }

  const rtt = formatRtt(connection.rttMs);

  if (connection.rttWarning) {
    return `Round trip time: ${rtt}\nHigher RTT can distort latency and throughput measurements, so for cleaner benchmark results it is recommended to run memtier closer to the Redis database.`;
  }

  return `Round trip time: ${rtt}`;
}

function formatRunWarningTooltip(error) {
  if (!error) {
    return '';
  }

  return `Run failed\n${error}`;
}

function formatProgress(value) {
  return `${Math.max(0, Math.min(100, value)).toFixed(0)}%`;
}

function formatTimestamp(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatShortTime(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatDuration(startedAt, endedAt) {
  if (!startedAt) {
    return '—';
  }

  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const start = new Date(startedAt).getTime();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (minutes === 0) {
    return `${remainder}s`;
  }

  return `${minutes}m ${remainder}s`;
}

function formatControlValue(field, value) {
  if (field === 'testTime') {
    return `${value}s`;
  }

  if (field === 'requestCount') {
    return formatCompactInteger(value);
  }

  if (field === 'dataSize') {
    return `${value} B`;
  }

  if (field === 'rateLimit') {
    return formatRateLimit(value);
  }

  return `${value}`;
}

function formatRunLimit(config) {
  if (config.limitMode === 'requests') {
    return `${formatCompactInteger(config.requestCount)} requests/client`;
  }

  return `${config.testTime}s`;
}

function formatCommandMix(config) {
  return `${config.setRatio}:${config.getRatio} ratio`;
}

function formatRateLimitSummary(config) {
  return config.rateLimitEnabled ? `${formatRateLimit(config.rateLimit)} cap` : 'Unlimited';
}

function describeDraftConfig(config) {
  return [
    `${config.clients} clients/thread`,
    `${config.threads} threads`,
    formatRunLimit(config),
    formatCommandMix(config),
    `${config.dataSize}B values`,
    `pipe ${config.pipeline}`,
    config.rateLimitEnabled ? `cap ${formatRateLimit(config.rateLimit)}` : null,
  ]
    .filter(Boolean)
    .join(' • ');
}

function describeDraftSummary(config, run) {
  return [run?.connectionName ?? null, describeDraftConfig(config)].filter(Boolean).join(' • ');
}

function buildDefaultDraftName(scenarioName, number) {
  return `${scenarioName} #${number}`;
}

function getBaseRunLabel(run, draft) {
  return draft?.name ?? run.displayName ?? run.scenarioName;
}

function appendConnectionName(label, connectionName) {
  if (!connectionName || label.includes(connectionName)) {
    return label;
  }

  return `${label} · ${connectionName}`;
}

function getDraftName(draft, scenario) {
  return draft?.name ?? buildDefaultDraftName(scenario.name, draft.number);
}

function getRunTitle(run, draft) {
  return appendConnectionName(getBaseRunLabel(run, draft), run.connectionName);
}

function sanitizeDraftName(name, fallback) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed || fallback;
}

function sanitizeFilename(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'memviz-run';
}

function createDraftId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isZeroish(value) {
  return Math.abs(Number(value) || 0) < 0.000001;
}

function trimTerminalResetPoints(points) {
  if (!points?.length) {
    return [];
  }

  if (!points.some((point) => !isZeroish(point.value))) {
    return points;
  }

  let endIndex = points.length;
  while (endIndex > 1 && isZeroish(points[endIndex - 1].value)) {
    endIndex -= 1;
  }

  return points.slice(0, endIndex);
}

function getSeriesValueAtEnd(points) {
  if (!points?.length) {
    return null;
  }

  const lastPoint = points.at(-1);
  return lastPoint?.value ?? null;
}

function getSeriesPeak(points) {
  if (!points?.length) {
    return null;
  }

  return points.reduce((peak, point) => Math.max(peak, point.value), points[0].value);
}

function getSeriesMinimum(points) {
  if (!points?.length) {
    return null;
  }

  return points.reduce((minimum, point) => Math.min(minimum, point.value), points[0].value);
}

function getSeriesPercentile(points, percentile) {
  const values = (points ?? [])
    .map((point) => point?.value)
    .filter((value) => value !== null && value !== undefined && !Number.isNaN(value))
    .sort((left, right) => left - right);

  if (!values.length) {
    return null;
  }

  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * values.length) - 1),
  );
  return values[index];
}

function getSeriesAverage(points) {
  const values = (points ?? [])
    .map((point) => point?.value)
    .filter((value) => value !== null && value !== undefined && !Number.isNaN(value));

  if (!values.length) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getAverageOfNumbers(values) {
  const numericValues = (values ?? []).filter(
    (value) => value !== null && value !== undefined && !Number.isNaN(value),
  );

  if (!numericValues.length) {
    return null;
  }

  return numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
}

function getDisplaySeries(run, key) {
  const points = run?.series?.[key] ?? [];
  if (!run || run.status === 'running') {
    return points;
  }

  if (
    [
      'ops_sec',
      'bytes_sec',
      'connections',
      'latency_ms',
      'latency_p50',
      'latency_p90',
      'latency_p99',
    ].includes(key)
  ) {
    return trimTerminalResetPoints(points);
  }

  return points;
}

function getFinalMetricValue(preferred, fallback = null) {
  if (preferred !== null && preferred !== undefined && !Number.isNaN(preferred)) {
    return preferred;
  }

  return fallback;
}

function getAverageThroughputValue(run) {
  const summaryTotals = run.summary?.results?.totals;
  const throughputSeries = getDisplaySeries(run, 'ops_sec');

  return getFinalMetricValue(
    summaryTotals?.opsSec,
    getFinalMetricValue(run.metrics.ops_sec_avg, getSeriesAverage(throughputSeries)),
  );
}

function getP99LatencyValue(run) {
  const summaryTotals = run.summary?.results?.totals;
  const latencyP99Series = getDisplaySeries(run, 'latency_p99');
  const rollingP99 = getSeriesAverage(latencyP99Series);

  if (run.status === 'running') {
    return getFinalMetricValue(rollingP99, run.metrics.latency_p99);
  }

  return getFinalMetricValue(
    summaryTotals?.p99Latency,
    getFinalMetricValue(rollingP99, run.metrics.latency_p99),
  );
}

function buildPrimaryMetricItems(run) {
  const finalThroughput = getAverageThroughputValue(run);
  const finalP99 = getP99LatencyValue(run);

  return [
    {
      iconSrc: pipelineIconWhite,
      label: 'Average throughput',
      tone: 'throughput',
      value: formatMetric(finalThroughput, formatOpsPerSecond),
    },
    {
      iconSrc: latencyIconWhite,
      label: 'p99 latency',
      tone: 'latency',
      value: formatMetric(finalP99, formatLatency),
    },
  ];
}

function buildAdvancedMetricItems(run) {
  const metrics = run.metrics;
  const summaryTotals = run.summary?.results?.totals;
  const throughputSeries = getDisplaySeries(run, 'ops_sec');
  const bytesSeries = getDisplaySeries(run, 'bytes_sec');
  const connectionsSeries = getDisplaySeries(run, 'connections');
  const latencySeries = getDisplaySeries(run, 'latency_ms');
  const averageThroughput = getAverageThroughputValue(run);
  const p90Latency = getFinalMetricValue(
    summaryTotals?.p90Latency,
    getFinalMetricValue(metrics.latency_p90, getSeriesPercentile(latencySeries, 90)),
  );

  const averageBandwidthDisplay =
    summaryTotals?.kbSec !== null && summaryTotals?.kbSec !== undefined
      ? formatKilobytesPerSecond(summaryTotals.kbSec)
      : formatMetric(
          getFinalMetricValue(metrics.bytes_sec_avg, getSeriesValueAtEnd(bytesSeries)),
          formatBytesPerSecond,
        );

  return [
    {
      label: 'Average throughput',
      value: formatMetric(averageThroughput, formatOpsPerSecond),
    },
    {
      label: run.status === 'running' ? 'Current throughput' : 'Peak throughput',
      value:
        run.status === 'running'
          ? formatMetric(metrics.ops_sec, formatOpsPerSecond)
          : formatMetric(getSeriesPeak(throughputSeries), formatOpsPerSecond),
    },
    {
      label: 'Minimum throughput',
      value: formatMetric(getSeriesMinimum(throughputSeries), formatOpsPerSecond),
    },
    {
      label: 'Average latency',
      value: formatMetric(
        getFinalMetricValue(summaryTotals?.avgLatency, metrics.latency_avg_ms),
        formatLatency,
      ),
    },
    {
      label: 'p50 latency',
      value: formatMetric(
        getFinalMetricValue(summaryTotals?.p50Latency, metrics.latency_p50),
        formatLatency,
      ),
    },
    {
      label: 'p90 latency',
      value: formatMetric(p90Latency, formatLatency),
    },
    {
      label: 'p99 latency',
      value: formatMetric(getP99LatencyValue(run), formatLatency),
    },
    {
      label: 'Average bandwidth',
      value: averageBandwidthDisplay,
    },
    {
      label: run.status === 'running' ? 'Connections' : 'Peak connections',
      value:
        run.status === 'running'
          ? formatMetric(metrics.connections, formatConnections)
          : formatMetric(getSeriesPeak(connectionsSeries), formatConnections),
    },
    {
      label: 'Connection errors',
      value: formatMetric(metrics.connection_errors, formatConnections),
    },
  ];
}

function buildSetupItems(config) {
  return [
    { label: 'Clients / thread', value: `${config.clients}` },
    { label: 'Threads', value: `${config.threads}` },
    { label: 'Run limit', value: formatRunLimit(config) },
    { label: 'Command mix', value: formatCommandMix(config) },
    { label: 'Value size', value: `${config.dataSize} B` },
    { label: 'Pipeline', value: `${config.pipeline}` },
    { label: 'Rate limiting', value: formatRateLimitSummary(config) },
  ];
}

function buildThroughputSummaryOptions(run) {
  const throughputSeries = getDisplaySeries(run, 'ops_sec');
  const averageThroughput = getAverageThroughputValue(run);

  return [
    {
      key: 'average',
      label: 'average',
      value: averageThroughput,
      formatter: formatOpsPerSecond,
    },
    {
      key: 'peak',
      label: 'peak',
      value: getSeriesPeak(throughputSeries),
      formatter: formatOpsPerSecond,
    },
    {
      key: 'minimum',
      label: 'minimum',
      value: getSeriesMinimum(throughputSeries),
      formatter: formatOpsPerSecond,
    },
  ];
}

function buildLatencySummaryOptions(run) {
  const metrics = run.metrics;
  const summaryTotals = run.summary?.results?.totals;
  const latencySeries = getDisplaySeries(run, 'latency_ms');

  return [
    {
      key: 'p50',
      label: 'p50',
      value: getFinalMetricValue(summaryTotals?.p50Latency, metrics.latency_p50),
      formatter: formatLatency,
    },
    {
      key: 'average',
      label: 'average',
      value: getFinalMetricValue(summaryTotals?.avgLatency, metrics.latency_avg_ms),
      formatter: formatLatency,
    },
    {
      key: 'p90',
      label: 'p90',
      value: getFinalMetricValue(
        summaryTotals?.p90Latency,
        getFinalMetricValue(metrics.latency_p90, getSeriesPercentile(latencySeries, 90)),
      ),
      formatter: formatLatency,
    },
    {
      key: 'p99',
      label: 'p99',
      value: getP99LatencyValue(run),
      formatter: formatLatency,
    },
  ];
}

function getScenarioOutcomeStats(run) {
  if (!run || run.status !== 'completed') {
    return [];
  }

  const averageThroughput = getAverageThroughputValue(run);
  const p99Latency = getP99LatencyValue(run);

  return [
    {
      label: 'Avg',
      value: formatMetric(averageThroughput, formatOpsPerSecond),
    },
    {
      label: 'p99',
      value: formatMetric(p99Latency, formatLatency),
    },
  ];
}

function getRunLabel(run, draft) {
  return appendConnectionName(getBaseRunLabel(run, draft), run.connectionName);
}

function getComparisonSnapshot(run, draft) {
  const summaryTotals = run.summary?.results?.totals;
  const throughputSeries = getDisplaySeries(run, 'ops_sec');
  const bytesSeries = getDisplaySeries(run, 'bytes_sec');
  const config = run.scenarioConfig ?? {};

  return {
    label: getRunLabel(run, draft),
    connection: run.connectionName ?? run.target?.summary ?? null,
    clients: config.clients ?? run.summary?.config.connectionsPerThread ?? null,
    threads: config.threads ?? run.summary?.config.threads ?? null,
    runLimit: config.limitMode ? formatRunLimit(config) : null,
    ratio:
      config.setRatio !== undefined && config.getRatio !== undefined
        ? `${config.setRatio}:${config.getRatio}`
        : null,
    dataSize: config.dataSize ?? null,
    pipeline: config.pipeline ?? null,
    rateLimit: config.limitMode ? formatRateLimitSummary(config) : null,
    averageThroughput: getAverageThroughputValue(run),
    peakThroughput: getSeriesPeak(throughputSeries),
    minimumThroughput: getSeriesMinimum(throughputSeries),
    averageBandwidthDisplay:
      summaryTotals?.kbSec !== null && summaryTotals?.kbSec !== undefined
        ? formatKilobytesPerSecond(summaryTotals.kbSec)
        : formatMetric(
            getFinalMetricValue(run.metrics.bytes_sec_avg, getSeriesValueAtEnd(bytesSeries)),
            formatBytesPerSecond,
          ),
    averageLatency: getFinalMetricValue(summaryTotals?.avgLatency, run.metrics.latency_avg_ms),
    p50Latency: getFinalMetricValue(summaryTotals?.p50Latency, run.metrics.latency_p50),
    p90Latency: getFinalMetricValue(summaryTotals?.p90Latency, run.metrics.latency_p90),
    p99Latency: getP99LatencyValue(run),
    hitsSec: summaryTotals?.hitsSec ?? null,
    missesSec: summaryTotals?.missesSec ?? null,
    connectionErrors: run.metrics.connection_errors,
  };
}

function buildComparisonRows(runsWithDrafts) {
  const snapshots = runsWithDrafts.map(({ draft, run }) => getComparisonSnapshot(run, draft));

  return [
    {
      type: 'section',
      label: 'Test setup',
    },
    {
      label: 'Connection',
      values: snapshots.map((snapshot) => snapshot.connection ?? '—'),
    },
    {
      label: 'Clients / thread',
      values: snapshots.map((snapshot) => formatMetric(snapshot.clients, String)),
    },
    {
      label: 'Threads',
      values: snapshots.map((snapshot) => formatMetric(snapshot.threads, String)),
    },
    {
      label: 'Run limit',
      values: snapshots.map((snapshot) => snapshot.runLimit ?? '—'),
    },
    {
      label: 'Command mix',
      values: snapshots.map((snapshot) => snapshot.ratio ?? '—'),
    },
    {
      label: 'Value size',
      values: snapshots.map((snapshot) => formatMetric(snapshot.dataSize, (value) => `${value} B`)),
    },
    {
      label: 'Pipeline',
      values: snapshots.map((snapshot) => formatMetric(snapshot.pipeline, String)),
    },
    {
      label: 'Rate limiting',
      values: snapshots.map((snapshot) => snapshot.rateLimit ?? '—'),
    },
    {
      type: 'section',
      label: 'Observed metrics',
    },
    {
      label: 'Average throughput',
      values: snapshots.map((snapshot) => formatMetric(snapshot.averageThroughput, formatOpsPerSecond)),
    },
    {
      label: 'Peak throughput',
      values: snapshots.map((snapshot) => formatMetric(snapshot.peakThroughput, formatOpsPerSecond)),
    },
    {
      label: 'Minimum throughput',
      values: snapshots.map((snapshot) =>
        formatMetric(snapshot.minimumThroughput, formatOpsPerSecond),
      ),
    },
    {
      label: 'Average latency',
      values: snapshots.map((snapshot) => formatMetric(snapshot.averageLatency, formatLatency)),
    },
    {
      label: 'p50 latency',
      values: snapshots.map((snapshot) => formatMetric(snapshot.p50Latency, formatLatency)),
    },
    {
      label: 'p90 latency',
      values: snapshots.map((snapshot) => formatMetric(snapshot.p90Latency, formatLatency)),
    },
    {
      label: 'p99 latency',
      values: snapshots.map((snapshot) => formatMetric(snapshot.p99Latency, formatLatency)),
    },
    {
      label: 'Average bandwidth',
      values: snapshots.map((snapshot) => snapshot.averageBandwidthDisplay),
    },
    {
      label: 'Hits / sec',
      values: snapshots.map((snapshot) => formatMetric(snapshot.hitsSec, formatCompactNumber)),
    },
    {
      label: 'Misses / sec',
      values: snapshots.map((snapshot) => formatMetric(snapshot.missesSec, formatCompactNumber)),
    },
    {
      label: 'Connection errors',
      values: snapshots.map((snapshot) => formatMetric(snapshot.connectionErrors, formatConnections)),
    },
  ];
}

function groupComparisonRows(rows) {
  const groups = [];
  let currentGroup = null;

  for (const row of rows) {
    if (row.type === 'section') {
      currentGroup = {
        label: row.label,
        rows: [],
      };
      groups.push(currentGroup);
      continue;
    }

    if (!currentGroup) {
      currentGroup = {
        label: 'Details',
        rows: [],
      };
      groups.push(currentGroup);
    }

    currentGroup.rows.push(row);
  }

  return groups;
}

function downloadComparisonCsv(runsWithDrafts) {
  const rows = buildComparisonRows(runsWithDrafts).filter((row) => row.values);
  const headers = ['Metric', ...runsWithDrafts.map(({ draft, run }) => getRunLabel(run, draft))];
  const csv = [headers, ...rows.map((row) => [row.label, ...row.values])]
    .map((columns) =>
      columns
        .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
        .join(','),
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `memviz-compare-${Date.now()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadRunPdf(element, runTitle) {
  if (!element) {
    return;
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const canvas = await html2canvas(element, {
    backgroundColor: '#1f2723',
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
  });
  const imageData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });
  const margin = 18;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageWidth = pageWidth - margin * 2;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;

  let heightLeft = imageHeight;
  let position = margin;

  pdf.addImage(imageData, 'PNG', margin, position, imageWidth, imageHeight, undefined, 'FAST');
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft > 0) {
    position = margin - (imageHeight - heightLeft);
    pdf.addPage();
    pdf.addImage(imageData, 'PNG', margin, position, imageWidth, imageHeight, undefined, 'FAST');
    heightLeft -= pageHeight - margin * 2;
  }

  pdf.save(`${sanitizeFilename(runTitle)}.pdf`);
}

async function downloadComparisonPdf(element) {
  await downloadRunPdf(element, `memviz-compare-${Date.now()}`);
}

function buildChartData(points) {
  return points.slice(-90).map((point, index) => ({
    index: index + 1,
    label: formatShortTime(point.timestamp),
    timestamp: point.timestamp,
    value: point.value,
  }));
}

function getCompareColor(index) {
  return COMPARE_CHART_COLORS[index % COMPARE_CHART_COLORS.length];
}

function canCompareRunTimelines(comparedRuns) {
  if (comparedRuns.length < 2) {
    return false;
  }

  const firstLimitMode = comparedRuns[0]?.run?.scenarioConfig?.limitMode;
  const firstTestTime = comparedRuns[0]?.run?.scenarioConfig?.testTime;

  if (firstLimitMode !== 'time' || !Number.isFinite(firstTestTime)) {
    return false;
  }

  return comparedRuns.every(
    ({ run }) =>
      run?.scenarioConfig?.limitMode === 'time' && run?.scenarioConfig?.testTime === firstTestTime,
  );
}

function getCompareMetricDefinitions(kind) {
  if (kind === 'throughput') {
    return [
      { key: 'ops_sec', label: 'ops/sec', formatter: formatOpsPerSecond },
      { key: 'bytes_sec', label: 'bytes/sec', formatter: formatBytesPerSecond },
    ];
  }

  return [
    { key: 'latency_ms', label: 'average', formatter: formatLatency },
    { key: 'latency_p50', label: 'p50', formatter: formatLatency },
    { key: 'latency_p90', label: 'p90', formatter: formatLatency },
    { key: 'latency_p99', label: 'p99', formatter: formatLatency },
  ];
}

function getCompareSeriesPoints(run, metricKey) {
  return getDisplaySeries(run, metricKey);
}

function buildCompareTimelineData(comparedRuns, metricKey) {
  const secondMap = new Map();

  comparedRuns.forEach(({ run }, index) => {
    const dataKey = `series_${index}`;
    const startedAtMs = run?.startedAt ? new Date(run.startedAt).getTime() : Number.NaN;

    getCompareSeriesPoints(run, metricKey).forEach((point) => {
      const pointMs = point?.timestamp ? new Date(point.timestamp).getTime() : Number.NaN;
      if (!Number.isFinite(startedAtMs) || !Number.isFinite(pointMs)) {
        return;
      }

      const second = Math.max(0, Math.round((pointMs - startedAtMs) / 1000));
      if (!secondMap.has(second)) {
        secondMap.set(second, {
          second,
          label: `${second}s`,
        });
      }

      secondMap.get(second)[dataKey] = point.value;
    });
  });

  return Array.from(secondMap.values())
    .sort((left, right) => left.second - right.second)
    .slice(-180);
}

function getCompareMetricSummaryValue(run, metricKey) {
  const series = getCompareSeriesPoints(run, metricKey);
  return getSeriesAverage(series);
}

function buildCompareMetricOptions(comparedRuns, kind) {
  return getCompareMetricDefinitions(kind).map((definition) => ({
    ...definition,
    value: getAverageOfNumbers(
      comparedRuns
        .map(({ run }) => getCompareMetricSummaryValue(run, definition.key))
        .filter((value) => value !== null && value !== undefined && !Number.isNaN(value)),
    ),
  }));
}

function IconAsset({ className = '', src }) {
  return <img alt="" aria-hidden="true" className={`icon-asset ${className}`.trim()} src={src} />;
}

function ConnectionScreen({
  formState,
  onFormChange,
  onConnect,
  connectDisabled,
  connectError,
  connectPending,
}) {
  return (
    <section className="connect-screen">
      <div className={`connect-panel ${connectError ? 'is-error' : ''}`}>
        <div className="connect-brand-row">
          <div className="brand-lockup">
            <div className="brand-mark-wrap">
              <IconAsset className="brand-mark" src={databaseDuotoneIcon} />
            </div>
            <div className="brand-copy">
              <p className="eyebrow">memviz</p>
              <span className="brand-caption">Redis benchmark workspace</span>
            </div>
          </div>

          <div className="connect-chip-grid">
            <div className="connect-chip">
              <span>Realtime</span>
              <strong>StatsD every second</strong>
            </div>
            <div className="connect-chip">
              <span>Quick start</span>
              <strong>127.0.0.1:6379</strong>
            </div>
          </div>
        </div>

        <h1>Benchmark Redis live, with a quieter workspace around the run.</h1>
        <p className="connect-copy">
          Start with a direct local target or paste a Redis URL. Leave the password empty to
          connect to <code>127.0.0.1:6379</code> without authentication.
        </p>

        <form className="connection-form" onSubmit={onConnect}>
          <label>
            <span>Host or URL</span>
            <input
              autoComplete="off"
              name="hostOrUrl"
              onChange={onFormChange}
              placeholder="127.0.0.1 or redis://default:secret@host:6379/0"
              value={formState.hostOrUrl}
            />
          </label>

          <div className="form-row">
            <label>
              <span>Port</span>
              <input
                inputMode="numeric"
                name="port"
                onChange={onFormChange}
                placeholder="6379"
                value={formState.port}
              />
            </label>

            <label>
              <span>Username</span>
              <input
                autoComplete="username"
                name="username"
                onChange={onFormChange}
                placeholder="default"
                value={formState.username}
              />
            </label>
          </div>

          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              name="password"
              onChange={onFormChange}
              placeholder="Optional"
              type="password"
              value={formState.password}
            />
          </label>

          {connectError ? <p className="form-error">{connectError}</p> : null}

          <button className="primary-button" disabled={connectDisabled} type="submit">
            {connectPending ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>
    </section>
  );
}

function ConnectionFormPanel({
  connectDisabled,
  connectPending,
  formState,
  onConnect,
  onFormChange,
}) {
  return (
    <form className="topbar-connect-form" onSubmit={onConnect}>
      <input
        autoComplete="off"
        name="hostOrUrl"
        onChange={onFormChange}
        placeholder="Host or URL"
        value={formState.hostOrUrl}
      />
      <input
        inputMode="numeric"
        name="port"
        onChange={onFormChange}
        placeholder="Port"
        value={formState.port}
      />
      <input
        autoComplete="username"
        name="username"
        onChange={onFormChange}
        placeholder="Username"
        value={formState.username}
      />
      <input
        autoComplete="current-password"
        name="password"
        onChange={onFormChange}
        placeholder="Password"
        type="password"
        value={formState.password}
      />
      <button className="primary-button" disabled={connectDisabled} type="submit">
        {connectPending ? 'Connecting…' : 'Connect'}
      </button>
    </form>
  );
}

function ConnectionCard({
  connection,
  disabled,
  isSelected,
  onDisconnect,
  onOpenRedisInsight,
  onRename,
  onSelect,
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(connection.name);
  const titleEditorRef = useRef(null);

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(connection.name);
    }
  }, [connection.name, isRenaming]);

  useEffect(() => {
    if (!isRenaming) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (titleEditorRef.current?.contains(event.target)) {
        return;
      }

      setIsRenaming(false);
      setRenameValue(connection.name);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [connection.name, isRenaming]);

  function commitRename() {
    setIsRenaming(false);
    onRename(connection.id, sanitizeDraftName(renameValue, connection.name));
  }

  return (
    <article
      className={`connection-card ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onSelect(connection.id)}
    >
      <div className="connection-card-header">
        <div className="scenario-title-row connection-title-row">
          {isRenaming ? (
            <div
              className="title-editor"
              onClick={(event) => event.stopPropagation()}
              ref={titleEditorRef}
            >
              <input
                className="title-editor-input"
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitRename();
                  }

                  if (event.key === 'Escape') {
                    setIsRenaming(false);
                    setRenameValue(connection.name);
                  }
                }}
                value={renameValue}
              />
              <button className="rename-confirm" onClick={commitRename} type="button">
                <CheckIcon />
              </button>
            </div>
          ) : (
            <>
              <strong>{connection.name}</strong>
              <button
                className="rename-toggle"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsRenaming(true);
                }}
                type="button"
              >
                <IconAsset className="button-icon button-icon-sm" src={editIconMidnight} />
              </button>
            </>
          )}
        </div>

        <button
          className="connection-disconnect-icon"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onDisconnect(connection.id);
          }}
          title="Disconnect"
          type="button"
        >
          <IconAsset className="button-icon" src={integratedModulesIconMidnight} />
        </button>
      </div>

      <div className="connection-card-meta">
        <div className="status-mark">
          <span
            className="connection-status-anchor"
            onClick={(event) => event.stopPropagation()}
            tabIndex={0}
          >
            <span className={`status-dot ${connection.rttWarning ? 'is-warning' : ''}`} />
            <span className="connection-status-tooltip">{getConnectionStatusTooltip(connection)}</span>
          </span>
          <span>Connected</span>
        </div>
        <span>{connection.summary}</span>
      </div>

      <button
        className="connection-insight-icon"
        onClick={(event) => {
          event.stopPropagation();
          onOpenRedisInsight(connection.redisInsightUrl);
        }}
        title="Open in RedisInsight"
        type="button"
      >
        <IconAsset className="button-icon redis-insight-icon-art" src={redisInsightIconDuotone} />
      </button>
    </article>
  );
}

function TopBar({
  connectDisabled,
  connectPending,
  connections,
  formState,
  hasRunningRuns,
  onConnect,
  onDisconnect,
  onFormChange,
  onPrepareAddConnection,
  onOpenRedisInsight,
  onRenameConnection,
  onSelectConnection,
  selectedConnectionId,
  setup,
}) {
  const [showAddConnectionForm, setShowAddConnectionForm] = useState(false);
  const setupReady = setup.status === 'ready';
  const setupNote =
    setup.status === 'error' ? 'Setup needs attention' : !setupReady ? 'Preparing memtier' : null;
  const canAddConnection =
    setupReady && connections.length < 3 && !hasRunningRuns;
  const showForm = !connections.length || showAddConnectionForm;

  useEffect(() => {
    if (!connections.length) {
      setShowAddConnectionForm(true);
      return;
    }

    setShowAddConnectionForm(false);
  }, [connections.length]);

  return (
    <header className={`topbar ${!connections.length ? 'topbar-disconnected' : ''}`}>
      <div className="topbar-brand">
        <div className="topbar-brand-mark">
          <IconAsset className="topbar-brand-icon" src={databaseDuotoneIcon} />
        </div>
        <div className="topbar-brand-copy">
          <p className="eyebrow">memviz</p>
          <strong>Redis benchmark workspace</strong>
          {setupNote ? (
            <span className={`topbar-brand-note topbar-brand-note-${setup.status}`}>{setupNote}</span>
          ) : null}
        </div>
      </div>

      <div className="topbar-connections">
        {connections.map((connection) => (
          <ConnectionCard
            connection={connection}
            disabled={hasRunningRuns}
            isSelected={connection.id === selectedConnectionId}
            key={connection.id}
            onDisconnect={onDisconnect}
            onOpenRedisInsight={onOpenRedisInsight}
            onRename={onRenameConnection}
            onSelect={onSelectConnection}
          />
        ))}

        {showForm ? (
          <ConnectionFormPanel
            connectDisabled={connectDisabled}
            connectPending={connectPending}
            formState={formState}
            onConnect={onConnect}
            onFormChange={onFormChange}
          />
        ) : null}
      </div>

      {connections.length ? (
        <div className="topbar-trailing">
          <button
            className="ghost-button"
            disabled={!canAddConnection}
            onClick={() =>
              setShowAddConnectionForm((current) => {
                const next = !current;
                if (next) {
                  onPrepareAddConnection();
                }
                return next;
              })
            }
            type="button"
          >
            {showForm ? 'Close' : 'Add connection'}
          </button>
        </div>
      ) : null}
    </header>
  );
}

function StepperControl({ disabled, displayValue, limits, onChange, value }) {
  return (
    <div className="stepper-control">
      <button
        disabled={disabled || value <= limits.min}
        onClick={() => onChange(value - limits.step)}
        type="button"
      >
        −
      </button>
      <span>{displayValue ?? value}</span>
      <button
        disabled={disabled || value >= limits.max}
        onClick={() => onChange(value + limits.step)}
        type="button"
      >
        +
      </button>
    </div>
  );
}

function FieldShell({ children, className = '', label, value }) {
  return (
    <div className={`tunable-field ${className}`.trim()}>
      <div className="tunable-header">
        <span>{label}</span>
        <div className="tunable-header-value">{value}</div>
      </div>
      {children}
    </div>
  );
}

function TunableField({ className, disabled, field, limits, onChange, value }) {
  if (!limits) {
    return null;
  }

  return (
    <FieldShell
      className={className}
      label={limits.label}
      value={formatControlValue(field, value)}
    >
      <div className="tunable-controls">
        <StepperControl disabled={disabled} limits={limits} onChange={onChange} value={value} />
        <input
          disabled={disabled}
          max={limits.max}
          min={limits.min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={limits.step}
          type="range"
          value={value}
        />
      </div>
    </FieldShell>
  );
}

function SegmentedField({ disabled, label, onChange, options, value }) {
  if (!options?.length) {
    return null;
  }

  const activeOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <FieldShell className="tunable-field-compact" label={label} value={activeOption.label}>
      <div className="segmented-control">
        {options.map((option) => (
          <button
            className={option.value === value ? 'is-active' : ''}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </FieldShell>
  );
}

function ComboButton({ className = '', disabled, onSelect, options, value }) {
  const [isOpen, setIsOpen] = useState(false);
  const activeOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    setIsOpen(false);
  }, [value]);

  return (
    <div className="combo-button-wrap">
      <button
        className={`combo-button ${className}`.trim()}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span>{activeOption?.label ?? value}</span>
        <span className="combo-chevron">▾</span>
      </button>

      {isOpen ? (
        <div className="combo-menu">
          {options.map((option) => (
            <button
              className={`combo-option ${option.value === value ? 'is-active' : ''}`}
              key={option.value}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NumericCellControl({ disabled, limits, onChange, value }) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  function commit(nextRawValue) {
    const parsed = Number(nextRawValue);
    const nextValue = clampValue(Number.isFinite(parsed) ? parsed : value, limits);
    setDraftValue(String(nextValue));
    onChange(nextValue);
  }

  return (
    <div className="table-number-control">
      <input
        disabled={disabled}
        inputMode="numeric"
        max={limits.max}
        min={limits.min}
        onBlur={() => commit(draftValue)}
        onChange={(event) => setDraftValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(draftValue);
          }

          if (event.key === 'Escape') {
            setDraftValue(String(value));
          }
        }}
        step={limits.step}
        type="number"
        value={draftValue}
      />
    </div>
  );
}

function ConfigRow({ label, children }) {
  return (
    <tr className="config-table-row">
      <th>{label}</th>
      <td>{children}</td>
    </tr>
  );
}

function ConfigTable({
  config,
  disabled,
  onConfigChange,
  scenario,
}) {
  const isRequests = config.limitMode === 'requests';
  const runLimitField = isRequests ? 'requestCount' : 'testTime';
  const runLimitLimits = isRequests ? scenario.limits.requestCount : scenario.limits.testTime;

  return (
    <div className="config-table-shell" onClick={(event) => event.stopPropagation()}>
      <table className="config-table-ui">
        <tbody>
          <ConfigRow label="Run limit">
            <div className="config-composite-control config-composite-control-paired">
              <ComboButton
                className="combo-button-cell"
                disabled={disabled}
                onSelect={(nextValue) => onConfigChange('limitMode', nextValue)}
                options={[
                  { label: 'Time', value: 'time' },
                  { label: 'Requests', value: 'requests' },
                ]}
                value={config.limitMode}
              />
              <NumericCellControl
                disabled={disabled}
                limits={runLimitLimits}
                onChange={(nextValue) => onConfigChange(runLimitField, nextValue)}
                value={config[runLimitField]}
              />
            </div>
          </ConfigRow>

          <ConfigRow label="Rate limiting">
            <div className="config-composite-control config-composite-control-paired">
              <label className="config-checkbox">
                <input
                  checked={config.rateLimitEnabled}
                  disabled={disabled}
                  onChange={(event) => onConfigChange('rateLimitEnabled', event.target.checked)}
                  type="checkbox"
                />
                <span>On</span>
              </label>
              {config.rateLimitEnabled ? (
                <NumericCellControl
                  disabled={disabled}
                  limits={scenario.limits.rateLimit}
                  onChange={(nextValue) => onConfigChange('rateLimit', nextValue)}
                  value={config.rateLimit}
                />
              ) : null}
            </div>
          </ConfigRow>

          <ConfigRow label="Clients / thread">
            <NumericCellControl
              disabled={disabled}
              limits={scenario.limits.clients}
              onChange={(nextValue) => onConfigChange('clients', nextValue)}
              value={config.clients}
            />
          </ConfigRow>

          <ConfigRow label="Threads">
            <NumericCellControl
              disabled={disabled}
              limits={scenario.limits.threads}
              onChange={(nextValue) => onConfigChange('threads', nextValue)}
              value={config.threads}
            />
          </ConfigRow>

          <ConfigRow label="Set ratio">
            <NumericCellControl
              disabled={disabled}
              limits={scenario.limits.setRatio}
              onChange={(nextValue) => onConfigChange('setRatio', nextValue)}
              value={config.setRatio}
            />
          </ConfigRow>

          <ConfigRow label="Get ratio">
            <NumericCellControl
              disabled={disabled}
              limits={scenario.limits.getRatio}
              onChange={(nextValue) => onConfigChange('getRatio', nextValue)}
              value={config.getRatio}
            />
          </ConfigRow>

          <ConfigRow label="Value bytes">
            <NumericCellControl
              disabled={disabled}
              limits={scenario.limits.dataSize}
              onChange={(nextValue) => onConfigChange('dataSize', nextValue)}
              value={config.dataSize}
            />
          </ConfigRow>

          <ConfigRow label="Pipeline">
            <NumericCellControl
              disabled={disabled}
              limits={scenario.limits.pipeline}
              onChange={(nextValue) => onConfigChange('pipeline', nextValue)}
              value={config.pipeline}
            />
          </ConfigRow>
        </tbody>
      </table>
    </div>
  );
}

function RunLimitField({
  config,
  disabled,
  onModeChange,
  onValueChange,
  requestLimits,
  timeLimits,
}) {
  const isRequests = config.limitMode === 'requests';
  const limits = isRequests ? requestLimits : timeLimits;
  const field = isRequests ? 'requestCount' : 'testTime';

  if (!limits) {
    return null;
  }

  return (
    <FieldShell
      className="tunable-field-wide"
      label="Run limit"
      value={
        <ComboButton
          disabled={disabled}
          onSelect={onModeChange}
          options={[
            { label: 'Time', value: 'time' },
            { label: 'Requests', value: 'requests' },
          ]}
          value={config.limitMode}
        />
      }
    >
      <div className="tunable-controls">
        <StepperControl
          disabled={disabled}
          displayValue={formatControlValue(field, config[field])}
          limits={limits}
          onChange={onValueChange}
          value={config[field]}
        />
        <input
          disabled={disabled}
          max={limits.max}
          min={limits.min}
          onChange={(event) => onValueChange(Number(event.target.value))}
          step={limits.step}
          type="range"
          value={config[field]}
        />
      </div>
    </FieldShell>
  );
}

function RateLimitField({
  checked,
  disabled,
  limits,
  onCheckedChange,
  onValueChange,
  value,
}) {
  return (
    <FieldShell className={`tunable-field-wide ${checked ? '' : 'is-muted'}`} label="Rate limit / sec">
      <label className="inline-check inline-check-spread">
        <span className="inline-check-main">
          <input
            checked={checked}
            disabled={disabled}
            onChange={(event) => onCheckedChange(event.target.checked)}
            type="checkbox"
          />
          <span>Rate limiting</span>
        </span>
        {checked ? <strong>{formatControlValue('rateLimit', value)}</strong> : null}
      </label>

      {checked ? (
        <div className="tunable-controls">
          <StepperControl
            disabled={disabled}
            displayValue={formatControlValue('rateLimit', value)}
            limits={limits}
            onChange={onValueChange}
            value={value}
          />
          <input
            disabled={disabled}
            max={limits.max}
            min={limits.min}
            onChange={(event) => onValueChange(Number(event.target.value))}
            step={limits.step}
            type="range"
            value={value}
          />
        </div>
      ) : null}
    </FieldShell>
  );
}

function ScenarioCard({
  compareMode,
  compareSelected,
  compareSelectionDisabled,
  config,
  connectionCount,
  disabled,
  draft,
  isLaunching,
  isLocked,
  isRunning,
  isSelected,
  isCustomizing,
  onRename,
  selectedConnectionName,
  onSelect,
  onToggleCompareSelection,
  run,
  onConfigChange,
  onRun,
  onToggleCustomize,
  progress,
  scenario,
}) {
  const outcomeStats = getScenarioOutcomeStats(run);
  const statusText =
    run?.status === 'completed'
      ? 'Finished'
      : run?.status === 'failed'
        ? 'Failed'
        : run?.status ?? 'Queued';
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(getDraftName(draft, scenario));
  const [showRunMenu, setShowRunMenu] = useState(false);
  const title = getDraftName(draft, scenario);
  const titleEditorRef = useRef(null);

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(title);
    }
  }, [isRenaming, title]);

  useEffect(() => {
    if (compareMode) {
      setIsRenaming(false);
    }
  }, [compareMode]);

  useEffect(() => {
    if (!isRenaming) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (titleEditorRef.current?.contains(event.target)) {
        return;
      }

      setIsRenaming(false);
      setRenameValue(title);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isRenaming, title]);

  useEffect(() => {
    if (disabled || compareMode || isLocked) {
      setShowRunMenu(false);
    }
  }, [compareMode, disabled, isLocked]);

  function commitRename() {
    setIsRenaming(false);
    onRename(draft.id, sanitizeDraftName(renameValue, title));
  }

  return (
    <article
      className={`scenario-card ${isRunning ? 'is-running' : ''} ${isLocked ? 'is-locked' : ''} ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onSelect(draft.id)}
    >
      <div className="scenario-card-header">
        <div className="scenario-copy">
          <div className="scenario-title-row">
            {isRenaming ? (
              <div
                className="title-editor"
                onClick={(event) => event.stopPropagation()}
                ref={titleEditorRef}
              >
                <input
                  className="title-editor-input"
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitRename();
                    }

                    if (event.key === 'Escape') {
                      setIsRenaming(false);
                      setRenameValue(title);
                    }
                  }}
                  value={renameValue}
                />
                <button className="rename-confirm" onClick={commitRename} type="button">
                  <CheckIcon />
                </button>
              </div>
            ) : (
              <>
                <strong>{title}</strong>
                {run?.status === 'failed' && run?.error ? (
                  <span className="run-warning-anchor" tabIndex={0}>
                    <WarningIcon />
                    <span className="run-warning-tooltip">{formatRunWarningTooltip(run.error)}</span>
                  </span>
                ) : null}
                {!compareMode ? (
                  <button
                    className="rename-toggle"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsRenaming(true);
                    }}
                    type="button"
                  >
                    <IconAsset className="button-icon button-icon-sm" src={editIconMidnight} />
                  </button>
                ) : null}
              </>
            )}
          </div>
          <span>{describeDraftSummary(config, run)}</span>
        </div>

        <div className="scenario-actions" onClick={(event) => event.stopPropagation()}>
          {compareMode ? (
            isLocked && run?.status === 'completed' ? (
              <label className={`compare-check ${compareSelected ? 'is-selected' : ''}`}>
                <input
                  checked={compareSelected}
                  disabled={compareSelectionDisabled}
                  onChange={() => onToggleCompareSelection(run.id)}
                  type="checkbox"
                />
                <span />
              </label>
            ) : null
          ) : !isLocked ? (
            <>
              <button
                className={`edit-toggle ${isCustomizing ? 'is-open' : ''}`}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleCustomize(draft.id);
                }}
                type="button"
              >
                <IconAsset className="button-icon" src={settingsIconMidnight} />
              </button>
              <div className="play-menu-wrap">
                <button
                  className="play-button"
                  disabled={disabled}
                  onClick={() => {
                    if (connectionCount <= 1) {
                      onRun(draft.id, 'selected');
                      return;
                    }

                    setShowRunMenu((open) => !open);
                  }}
                  type="button"
                >
                  {isLaunching ? '…' : '▶'}
                </button>

                {showRunMenu && connectionCount > 1 ? (
                  <div className="play-menu">
                    <button
                      className="play-menu-option"
                      onClick={() => {
                        setShowRunMenu(false);
                        onRun(draft.id, 'selected');
                      }}
                      type="button"
                    >
                      {`Run on ${selectedConnectionName ?? 'selected connection'}`}
                    </button>
                    <button
                      className="play-menu-option"
                      onClick={() => {
                        setShowRunMenu(false);
                        onRun(draft.id, 'all');
                      }}
                      type="button"
                    >
                      Run on all connections
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : run?.status !== 'completed' ? (
            <span className={`scenario-state scenario-state-${run?.status ?? 'queued'}`}>
              {isLaunching ? 'Launching' : run?.status ?? 'Queued'}
            </span>
          ) : null}
        </div>
      </div>

      {isCustomizing && !isLocked ? (
        <ConfigTable
          config={config}
          disabled={disabled}
          onConfigChange={(field, nextValue) => onConfigChange(draft.id, field, nextValue)}
          scenario={scenario}
        />
      ) : null}

      {isRunning ? (
        <div className="scenario-progress-block">
          <div className="scenario-progress-head">
            <span>Benchmark progress</span>
            <strong>{formatProgress(progress)}</strong>
          </div>
          <div className="progress-track progress-track-light">
            <span
              className="progress-fill"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        </div>
      ) : null}

      {isLocked && !isRunning ? (
        <div className="scenario-meta-row">
          <span>{statusText}</span>
          <div className="scenario-result-stats">
            {outcomeStats.map((stat) => (
              <span className="scenario-result-stat" key={stat.label}>
                {stat.label}
                {' '}
                <strong>{stat.value}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ScenarioList({
  canCreateDraft,
  canClear,
  canOpenCompareMode,
  compareMode,
  compareView,
  connections,
  drafts,
  hasRunningRuns,
  onClear,
  onCompareSelected,
  onRename,
  onSelect,
  onToggleCompareMode,
  onToggleCompareSelection,
  onNewTest,
  scenarios,
  runById,
  runPendingDraftId,
  selectedComparisonRunIds,
  selectedConnectionName,
  selectedDraftId,
  onConfigChange,
  onRun,
  onToggleCustomize,
  scenarioMap,
}) {
  const [showNewTestMenu, setShowNewTestMenu] = useState(false);

  useEffect(() => {
    if (!canCreateDraft || compareMode) {
      setShowNewTestMenu(false);
    }
  }, [canCreateDraft, compareMode]);

  return (
    <aside className="scenario-panel">
      <div className="panel-header">
        <p className="eyebrow">Tests</p>
      </div>

      <div className="scenario-toolbar">
        <div className="toolbar-menu">
          <button
            className="ghost-button"
            disabled={!canCreateDraft || compareMode}
            onClick={() => setShowNewTestMenu((open) => !open)}
            type="button"
          >
            New test
          </button>

          {showNewTestMenu ? (
            <div className="scenario-picker-menu">
              {scenarios.map((scenario) => (
                <button
                  className="scenario-picker-item"
                  key={scenario.id}
                  onClick={() => {
                    onNewTest(scenario.id);
                    setShowNewTestMenu(false);
                  }}
                  type="button"
                >
                  <strong>{scenario.name}</strong>
                  <span>
                    {describeDraftConfig(scenario.defaults)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          className={`ghost-button ${compareMode || compareView ? 'is-active' : ''}`}
          disabled={!compareMode && !compareView && !canOpenCompareMode}
          onClick={onToggleCompareMode}
          type="button"
        >
          {compareMode || compareView ? 'Done comparing' : 'Compare'}
        </button>
        <button
          className="ghost-button"
          disabled={!canClear}
          onClick={onClear}
          type="button"
        >
          Clear
        </button>
        {compareMode && selectedComparisonRunIds.length >= 2 ? (
          <button className="primary-button" onClick={onCompareSelected} type="button">
            Compare selected
          </button>
        ) : null}
      </div>

      <div className="scenario-list">
        {drafts.length ? (
          drafts.map((draft) => {
            const scenario = scenarioMap.get(draft.scenarioId);
            const run = draft.runId ? runById.get(draft.runId) ?? null : null;
            if (!scenario) {
              return null;
            }

            return (
              <ScenarioCard
                compareMode={compareMode}
                compareSelected={selectedComparisonRunIds.includes(run?.id)}
                compareSelectionDisabled={
                  selectedComparisonRunIds.length >= 5 && !selectedComparisonRunIds.includes(run?.id)
                }
                config={draft.config}
                connectionCount={connections.length}
                disabled={hasRunningRuns || runPendingDraftId !== null}
                draft={draft}
                isCustomizing={draft.isCustomizing}
                isLaunching={runPendingDraftId === draft.id}
                isLocked={Boolean(draft.runId)}
                isRunning={run?.status === 'running'}
                isSelected={!compareMode && selectedDraftId === draft.id}
                key={draft.id}
                onRename={onRename}
                onSelect={onSelect}
                onToggleCompareSelection={onToggleCompareSelection}
                onToggleCustomize={onToggleCustomize}
                onConfigChange={onConfigChange}
                onRun={onRun}
                progress={run?.metrics.progress_pct ?? 0}
                run={run}
                scenario={scenario}
                selectedConnectionName={selectedConnectionName}
              />
            );
          })
        ) : (
          <div className="scenario-empty">
            <p className="eyebrow">No tests yet</p>
            <p>Create a test from the toolbar when you’re ready to run Memtier.</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function MetricStrip({ metrics, variant = 'default' }) {
  return (
    <section className={`metric-strip metric-strip-${variant}`}>
      {metrics.map((metric) => (
        <div className={`metric-item ${metric.tone ? `metric-item-${metric.tone}` : ''}`} key={metric.label}>
          {variant === 'hero' ? (
            <div className="metric-head">
              {metric.iconSrc ? <IconAsset className="metric-icon metric-icon-plain" src={metric.iconSrc} /> : null}
              <span className="metric-label">{metric.label}</span>
            </div>
          ) : (
            <>
              {metric.iconSrc ? (
                <span className={`metric-icon-chip ${metric.tone ? `metric-icon-chip-${metric.tone}` : ''}`}>
                  <IconAsset className="metric-icon" src={metric.iconSrc} />
                </span>
              ) : null}
              <span className="metric-label">{metric.label}</span>
            </>
          )}
          <strong className="metric-value">{metric.value}</strong>
        </div>
      ))}
    </section>
  );
}

function DetailSection({ iconSrc, items, title }) {
  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <div className="detail-section-title">
          {iconSrc ? <IconAsset className="section-icon" src={iconSrc} /> : null}
          <p className="eyebrow">{title}</p>
        </div>
      </div>
      <MetricStrip metrics={items} />
    </section>
  );
}

function RealtimeTooltip({ formatter, active, label, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <span>{label}</span>
      <strong>{formatter(payload[0].value)}</strong>
    </div>
  );
}

function CompareRealtimeTooltip({ active, formatter, label, payload, seriesMeta }) {
  if (!active || !payload?.length) {
    return null;
  }

  const visiblePayload = seriesMeta
    .map((series) => ({
      ...series,
      point: payload.find((entry) => entry.dataKey === series.dataKey),
    }))
    .filter((entry) => entry.point && entry.point.value !== null && entry.point.value !== undefined);

  if (!visiblePayload.length) {
    return null;
  }

  return (
    <div className="chart-tooltip compare-chart-tooltip">
      <span>{label}</span>
      <div className="compare-tooltip-list">
        {visiblePayload.map((entry) => (
          <div className="compare-tooltip-row" key={entry.dataKey}>
            <span className="compare-tooltip-name" style={{ color: entry.color }}>
              {entry.label}
            </span>
            <strong>{formatter(entry.point.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartStatPicker({ onChange, options, selectedKey }) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.key === selectedKey) ?? options[0];

  useEffect(() => {
    setIsOpen(false);
  }, [selectedKey]);

  return (
    <div className="chart-stat-picker">
      <button
        className="chart-stat-button"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span className="chart-stat-inline">
          <span>{selected.label}:</span>
          <strong>{formatMetric(selected.value, selected.formatter)}</strong>
        </span>
      </button>

      {isOpen ? (
        <div className="chart-stat-menu">
          {options.map((option) => (
            <button
              className={`chart-stat-option ${option.key === selected.key ? 'is-active' : ''}`}
              key={option.key}
              onClick={() => onChange(option.key)}
              type="button"
            >
              <span>{option.label}</span>
              <strong>{formatMetric(option.value, option.formatter)}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompareMetricPicker({ onChange, options, selectedKey }) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.key === selectedKey) ?? options[0];

  useEffect(() => {
    setIsOpen(false);
  }, [selectedKey]);

  return (
    <div className="chart-stat-picker">
      <button
        className="chart-stat-button"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span className="chart-stat-inline">
          <span>metric:</span>
          <strong>{selected?.label ?? '—'}</strong>
        </span>
      </button>

      {isOpen ? (
        <div className="chart-stat-menu">
          {options.map((option) => (
            <button
              className={`chart-stat-option ${option.key === selected?.key ? 'is-active' : ''}`}
              key={option.key}
              onClick={() => onChange(option.key)}
              type="button"
            >
              <span>metric</span>
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TimeseriesChart({
  color,
  emptyValue = 'Waiting for samples',
  emptyVariant = 'message',
  formatter,
  hideValueWhenEmpty = false,
  iconSrc,
  points,
  statOptions,
  statSelection,
  onStatSelectionChange,
  title,
}) {
  const data = buildChartData(points);

  return (
    <section className="chart-panel">
      <div className="chart-header">
        <div className="chart-title-row">
          {iconSrc ? <IconAsset className="section-icon section-icon-sm" src={iconSrc} /> : null}
          <p className="eyebrow">{title}</p>
        </div>
        {statOptions?.length ? (
          <ChartStatPicker
            onChange={onStatSelectionChange}
            options={statOptions}
            selectedKey={statSelection}
          />
        ) : hideValueWhenEmpty && !data.length ? null : (
          <strong className="chart-latest">
            {data.length ? formatter(data.at(-1).value) : emptyValue}
          </strong>
        )}
      </div>

      <div className="chart-area">
        {data.length ? (
          <ResponsiveContainer height={220} width="100%">
            <LineChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="label"
                minTickGap={32}
                tick={{ fill: 'rgba(251,248,241,0.48)', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                tick={{ fill: 'rgba(251,248,241,0.48)', fontSize: 12 }}
                tickFormatter={(value) => formatter(value)}
                tickLine={false}
                width={88}
              />
              <Tooltip content={<RealtimeTooltip formatter={formatter} />} cursor={{ stroke: color, strokeOpacity: 0.22 }} />
              <Line
                dataKey="value"
                dot={false}
                isAnimationActive={false}
                stroke={color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className={`chart-empty chart-empty-${emptyVariant}`}>
            {emptyVariant === 'number' ? <strong>{emptyValue}</strong> : emptyValue}
          </div>
        )}
      </div>
    </section>
  );
}

function CompareTimeseriesChart({
  colorMap,
  comparedRuns,
  metricKind,
  onMetricSelectionChange,
  selectedMetricKey,
  title,
}) {
  const options = buildCompareMetricOptions(comparedRuns, metricKind);
  const selectedOption = options.find((option) => option.key === selectedMetricKey) ?? options[0];
  const data = buildCompareTimelineData(comparedRuns, selectedOption.key);
  const seriesMeta = comparedRuns.map(({ draft, run }, index) => ({
    color: colorMap[index],
    dataKey: `series_${index}`,
    label: getBaseRunLabel(run, draft),
  }));

  return (
    <section className="chart-panel compare-chart-panel">
      <div className="chart-header">
        <div className="chart-title-row">
          <p className="eyebrow">{title}</p>
        </div>
        <CompareMetricPicker
          onChange={onMetricSelectionChange}
          options={options}
          selectedKey={selectedMetricKey}
        />
      </div>

      <div className="chart-area">
        {data.length ? (
          <ResponsiveContainer height={220} width="100%">
            <LineChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="second"
                domain={['dataMin', 'dataMax']}
                minTickGap={20}
                tick={{ fill: 'rgba(251,248,241,0.48)', fontSize: 12 }}
                tickFormatter={(value) => `${value}s`}
                tickLine={false}
                type="number"
              />
              <YAxis
                axisLine={false}
                tick={{ fill: 'rgba(251,248,241,0.48)', fontSize: 12 }}
                tickFormatter={(value) => selectedOption.formatter(value)}
                tickLine={false}
                width={88}
              />
              <Tooltip
                content={
                  <CompareRealtimeTooltip
                    formatter={selectedOption.formatter}
                    seriesMeta={seriesMeta}
                  />
                }
                cursor={{ stroke: '#ffffff', strokeOpacity: 0.18 }}
              />
              {seriesMeta.map((series) => (
                <Line
                  connectNulls
                  dataKey={series.dataKey}
                  dot={false}
                  isAnimationActive={false}
                  key={series.dataKey}
                  stroke={series.color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  type="monotone"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="chart-empty">Waiting for samples</div>
        )}
      </div>
    </section>
  );
}

function SummaryTable({ summary }) {
  const rows = ['totals', 'sets', 'gets', 'waits']
    .map((key) => summary?.results?.[key])
    .filter(Boolean);

  if (!rows.length) {
    return null;
  }

  return (
    <section className="summary-panel">
      <div className="panel-header">
        <p className="eyebrow">Memtier results</p>
        <h2>Final aggregate results parsed from the benchmark stream.</h2>
      </div>

      <div className="summary-meta">
        <span>
          Threads:
          {' '}
          <strong>{summary.config.threads ?? '—'}</strong>
        </span>
        <span>
          Connections / thread:
          {' '}
          <strong>{summary.config.connectionsPerThread ?? '—'}</strong>
        </span>
        <span>
          Seconds:
          {' '}
          <strong>{summary.config.seconds ?? '—'}</strong>
        </span>
      </div>

      <div className="summary-table-wrap">
        <table className="summary-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Ops/sec</th>
              <th>Hits/sec</th>
              <th>Misses/sec</th>
              <th>Avg latency</th>
              <th>p50</th>
              <th>p90</th>
              <th>p99</th>
              <th>KB/sec</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{formatMetric(row.opsSec, formatCompactNumber)}</td>
                <td>{formatMetric(row.hitsSec, formatCompactNumber)}</td>
                <td>{formatMetric(row.missesSec, formatCompactNumber)}</td>
                <td>{formatMetric(row.avgLatency, formatLatency)}</td>
                <td>{formatMetric(row.p50Latency, formatLatency)}</td>
                <td>{formatMetric(row.p90Latency, formatLatency)}</td>
                <td>{formatMetric(row.p99Latency, formatLatency)}</td>
                <td>{formatMetric(row.kbSec, formatKilobytesPerSecond)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LogConsole({ logs }) {
  const scrollerRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);

  function updatePinnedState() {
    if (!scrollerRef.current) {
      return;
    }

    const remaining =
      scrollerRef.current.scrollHeight -
      scrollerRef.current.scrollTop -
      scrollerRef.current.clientHeight;
    const nextPinned = remaining < 32;
    stickToBottomRef.current = nextPinned;
    setIsPinnedToBottom(nextPinned);
  }

  useEffect(() => {
    if (!scrollerRef.current) {
      return;
    }

    if (stickToBottomRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="log-shell">
      <div className="log-console" onScroll={updatePinnedState} ref={scrollerRef}>
        {logs.length ? (
          logs.map((entry, index) => (
            <div className={`log-line log-${entry.stream}`} key={`${entry.timestamp}-${index}`}>
              <span className="log-time">{formatShortTime(entry.timestamp)}</span>
              <span className="log-tag-wrap">
                {entry.stream === 'meta' ? <span className="log-tag">system</span> : null}
                {entry.stream === 'stderr' ? <span className="log-tag log-tag-error">error</span> : null}
              </span>
              <span className="log-text">{entry.text}</span>
            </div>
          ))
        ) : (
          <div className="log-empty">Run output will stream here as soon as Memtier starts.</div>
        )}
      </div>

      {!isPinnedToBottom && logs.length ? (
        <button
          className="log-jump"
          onClick={() => {
            if (!scrollerRef.current) {
              return;
            }

            scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
            stickToBottomRef.current = true;
            setIsPinnedToBottom(true);
          }}
          type="button"
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}

function SetupPanel({ onRetry, setup }) {
  const statusTitle =
    setup.status === 'error' ? 'Memtier setup needs attention.' : 'Preparing memtier.';
  const statusCopy =
    setup.status === 'error'
      ? setup.error
      : `memviz checks for local memtier_benchmark ${setup.minimumVersion}+ first, then prepares the official Docker image if needed.`;

  return (
    <section className={`setup-panel ${setup.status === 'error' ? 'is-error' : ''}`}>
      <div className="setup-panel-head">
        <div className="setup-panel-mark">
          <IconAsset className="setup-panel-icon" src={integratedModulesIconMidnight} />
        </div>

        <div className="setup-panel-copy">
          <p className="eyebrow">Setup</p>
          <h2>{statusTitle}</h2>
          <p className="setup-panel-text">{statusCopy}</p>
        </div>
      </div>

      <div className="setup-progress-header">
        <span>{setup.message}</span>
        <strong>{Math.round(setup.progress)}%</strong>
      </div>
      <div className="progress-track progress-track-dark">
        <span className="progress-fill" style={{ width: `${setup.progress}%` }} />
      </div>

      <div className="setup-summary">
        <span>Minimum version: {setup.minimumVersion}</span>
        <span>Serving on: {setup.appUrl}</span>
      </div>

      <div className="setup-step-list">
        {setup.steps.map((step) => (
          <div className={`setup-step setup-step-${step.status}`} key={step.id}>
            <span className="setup-step-mark">
              {step.status === 'completed'
                ? '✓'
                : step.status === 'failed'
                  ? '!'
                  : step.status === 'running'
                    ? '…'
                    : '•'}
            </span>
            <div className="setup-step-copy">
              <strong>{step.label}</strong>
              {step.detail ? <span>{step.detail}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="setup-log-panel">
        {setup.logs.length ? (
          setup.logs.slice(-10).map((entry, index) => (
            <div className="setup-log-line" key={`${entry.timestamp}-${index}`}>
              <span>{formatShortTime(entry.timestamp)}</span>
              <span>{entry.text}</span>
            </div>
          ))
        ) : (
          <div className="setup-log-line setup-log-line-empty">
            <span>Waiting for setup output…</span>
          </div>
        )}
      </div>

      {setup.status === 'error' ? (
        <div className="setup-actions">
          <button className="primary-button" onClick={onRetry} type="button">
            Retry setup
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DraftPreviewPanel({ draft, scenario }) {
  return (
    <section className="metrics-panel metrics-empty">
      <div className="metrics-empty-figure">
        <IconAsset className="metrics-empty-icon" src={settingsIconWhite} />
      </div>

      <div className="panel-header panel-header-center">
        <p className="eyebrow">Ready test</p>
        <h2>{getDraftName(draft, scenario)}</h2>
      </div>

      <p className="empty-copy">ready to be played</p>
    </section>
  );
}

function ComparePanel({ comparedRuns }) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [throughputMetricKey, setThroughputMetricKey] = useState('ops_sec');
  const [latencyMetricKey, setLatencyMetricKey] = useState('latency_p99');
  const [chartsCollapsed, setChartsCollapsed] = useState(false);
  const exportRootRef = useRef(null);

  if (comparedRuns.length < 2) {
    return (
      <section className="metrics-panel metrics-empty">
        <div className="metrics-empty-figure">
          <IconAsset className="metrics-empty-icon" src={dashboardIconWhite} />
        </div>

        <div className="panel-header panel-header-center">
          <p className="eyebrow">Compare</p>
          <h2>Select between two and five completed tests to compare them.</h2>
        </div>
      </section>
    );
  }

  const rows = buildComparisonRows(comparedRuns);
  const groupedRows = groupComparisonRows(rows);
  const canCompareTimelines = canCompareRunTimelines(comparedRuns);
  const compareColors = comparedRuns.map((_, index) => getCompareColor(index));

  async function handleExportPdf() {
    const previousCollapsedSections = collapsedSections;
    const previousChartsCollapsed = chartsCollapsed;

    try {
      setShowExportMenu(false);
      setCollapsedSections({});
      setChartsCollapsed(false);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      await downloadComparisonPdf(exportRootRef.current);
    } finally {
      setCollapsedSections(previousCollapsedSections);
      setChartsCollapsed(previousChartsCollapsed);
    }
  }

  return (
    <section className="metrics-panel compare-panel" ref={exportRootRef}>
      <div className="metrics-header">
        <div>
          <div className="title-with-icon">
            <IconAsset className="section-icon" src={dashboardIconWhite} />
            <p className="eyebrow">Compare</p>
          </div>
          <h2>Benchmark comparison.</h2>
          <p className="metrics-subtitle">
            {comparedRuns.map(({ draft, run }) => getRunLabel(run, draft)).join(' · ')}
          </p>
        </div>

        <div className="export-actions">
          <button
            className="ghost-button ghost-button-dark"
            onClick={() => setShowExportMenu((open) => !open)}
            type="button"
          >
            Export
          </button>

          {showExportMenu ? (
            <div className="export-menu">
              <button
                className="export-option"
                onClick={() => downloadComparisonCsv(comparedRuns)}
                type="button"
              >
                Export as CSV
              </button>
              <button className="export-option" onClick={handleExportPdf} type="button">
                Download as PDF
              </button>
              <button className="export-option is-disabled" disabled type="button">
                Export to Google Slides
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {canCompareTimelines ? (
        <section className="summary-panel compare-charts-section">
          <div className="compare-section-header">
            <button
              className="comparison-section-toggle"
              onClick={() => setChartsCollapsed((current) => !current)}
              type="button"
            >
              <span className="comparison-section-label">Timeline charts</span>
              <span className={`disclosure-chevron ${chartsCollapsed ? '' : 'is-open'}`}>▾</span>
            </button>
          </div>

          {!chartsCollapsed ? (
            <div className="chart-grid-layout chart-grid-layout-primary compare-chart-grid">
              <CompareTimeseriesChart
                colorMap={compareColors}
                comparedRuns={comparedRuns}
                metricKind="throughput"
                onMetricSelectionChange={setThroughputMetricKey}
                selectedMetricKey={throughputMetricKey}
                title="throughput"
              />
              <CompareTimeseriesChart
                colorMap={compareColors}
                comparedRuns={comparedRuns}
                metricKind="latency"
                onMetricSelectionChange={setLatencyMetricKey}
                selectedMetricKey={latencyMetricKey}
                title="latency"
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="summary-panel compare-table-panel">
        <div className="summary-table-wrap">
          <table className="summary-table comparison-table">
            <thead>
              <tr>
                <th>Metric</th>
                {comparedRuns.map(({ draft, run }, index) => (
                  <th key={run.id}>
                    <div className="comparison-run-head">
                      <span
                        className="comparison-run-title"
                        style={{ color: compareColors[index] }}
                      >
                        {getBaseRunLabel(run, draft)}
                      </span>
                      <span className="comparison-run-connection">
                        {run.connectionName ?? run.target?.summary ?? '—'}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group) => {
                const isCollapsed = Boolean(collapsedSections[group.label]);

                return (
                  <Fragment key={group.label}>
                    <tr className="comparison-section-row">
                      <td colSpan={comparedRuns.length + 1}>
                        <button
                          className="comparison-section-toggle"
                          onClick={() =>
                            setCollapsedSections((current) => ({
                              ...current,
                              [group.label]: !current[group.label],
                            }))
                          }
                          type="button"
                        >
                          <span className="comparison-section-label">{group.label}</span>
                          <span className={`disclosure-chevron ${isCollapsed ? '' : 'is-open'}`}>
                            ▾
                          </span>
                        </button>
                      </td>
                    </tr>

                    {!isCollapsed
                      ? group.rows.map((row) => (
                          <tr className="comparison-data-row" key={row.label}>
                            <td>{row.label}</td>
                            {row.values.map((value, index) => (
                              <td key={`${row.label}-${index}`}>{value}</td>
                            ))}
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function MetricsPanel({ draft, run }) {
  const [openPanel, setOpenPanel] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [throughputStat, setThroughputStat] = useState('average');
  const [latencyStat, setLatencyStat] = useState('p99');
  const exportRootRef = useRef(null);

  useEffect(() => {
    setOpenPanel(null);
    setShowExportMenu(false);
    setThroughputStat('average');
    setLatencyStat('p99');
  }, [run?.id]);

  if (!run) {
    return (
      <section className="metrics-panel metrics-empty">
        <div className="metrics-empty-figure">
          <IconAsset className="metrics-empty-icon" src={dashboardIconWhite} />
        </div>

        <div className="panel-header panel-header-center">
          <p className="eyebrow">Workspace</p>
          <h2>Create a test on the left to open benchmark details here.</h2>
        </div>
      </section>
    );
  }

  const resultEyebrow =
    run.status === 'running' ? 'Active run' : run.status === 'failed' ? 'Failed run' : 'Finished run';
  const resultEyebrowIcon =
    run.status === 'completed'
      ? meteringIconMidnight
      : run.status === 'failed'
        ? cliIconMidnight
        : databaseWhiteIcon;
  const runTitle = getRunTitle(run, draft);
  const metricItems = buildPrimaryMetricItems(run);
  const advancedMetricItems = buildAdvancedMetricItems(run);
  const throughputAdvancedItems = advancedMetricItems.filter((item) =>
    [
      'Average throughput',
      'Current throughput',
      'Peak throughput',
      'Minimum throughput',
      'Average bandwidth',
    ].includes(item.label),
  );
  const latencyAdvancedItems = advancedMetricItems.filter((item) =>
    ['Average latency', 'p50 latency', 'p90 latency', 'p99 latency'].includes(item.label),
  );
  const connectionAdvancedItems = advancedMetricItems.filter((item) =>
    ['Connections', 'Peak connections', 'Connection errors'].includes(item.label),
  );
  const throughputSeries = getDisplaySeries(run, 'ops_sec');
  const latencySeries = getDisplaySeries(run, 'latency_ms');
  const bytesSeries = getDisplaySeries(run, 'bytes_sec');
  const connectionsSeries = getDisplaySeries(run, 'connections');
  const connectionErrorsSeries = getDisplaySeries(run, 'connection_errors');
  const throughputOptions = buildThroughputSummaryOptions(run);
  const latencyOptions = buildLatencySummaryOptions(run);

  return (
    <section className="metrics-panel" ref={exportRootRef}>
      <div className="metrics-header">
        <div>
          <div className="title-with-icon">
            <IconAsset
              className={`section-icon ${run.status !== 'running' ? 'section-icon-inverted' : ''}`}
              src={resultEyebrowIcon}
            />
            <p className="eyebrow">{resultEyebrow}</p>
          </div>
          <div className="metrics-title-row">
            <h2>{runTitle}</h2>
            <div className="run-time-markers">
              <span className="run-time-marker">
                Started
                {' '}
                {formatTimestamp(run.startedAt)}
              </span>
              <span className="run-time-marker">
                Ended
                {' '}
                {formatTimestamp(run.endedAt)}
              </span>
            </div>
          </div>
          <p className="metrics-subtitle">{run.scenarioDescription}</p>
        </div>

        {run.status === 'completed' ? (
          <div className="export-actions">
            <button
              className="ghost-button ghost-button-dark"
              onClick={() => setShowExportMenu((open) => !open)}
              type="button"
            >
              Export
            </button>

            {showExportMenu ? (
              <div className="export-menu">
                <button
                  className="export-option"
                  onClick={async () => {
                    setShowExportMenu(false);
                    await new Promise((resolve) => window.requestAnimationFrame(resolve));
                    await downloadRunPdf(exportRootRef.current, runTitle);
                  }}
                  type="button"
                >
                  Export as PDF
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={`run-status run-status-${run.status}`}>
            <span>{run.status}</span>
          </div>
        )}
      </div>

      <MetricStrip metrics={metricItems} variant="hero" />

      <div className="chart-grid-layout chart-grid-layout-primary">
        <TimeseriesChart
          color="#c895e3"
          formatter={(value) => `${formatCompactNumber(value)} ops/s`}
          iconSrc={pipelineIconWhite}
          onStatSelectionChange={setThroughputStat}
          points={throughputSeries}
          statOptions={throughputOptions}
          statSelection={throughputStat}
          title="throughput"
        />

        <TimeseriesChart
          color="#ddff21"
          formatter={formatLatency}
          iconSrc={latencyIconWhite}
          onStatSelectionChange={setLatencyStat}
          points={latencySeries}
          statOptions={latencyOptions}
          statSelection={latencyStat}
          title="latency"
        />
      </div>

      <div className="toggle-row">
        <button
          className={`ghost-button ghost-button-dark disclosure-button ${openPanel === 'advanced' ? 'is-open' : ''}`}
          onClick={() =>
            setOpenPanel((currentPanel) =>
              currentPanel === 'advanced' ? null : 'advanced'
            )
          }
          type="button"
        >
          <IconAsset
            className="button-icon section-icon-inverted"
            src={analysisIconMidnight}
          />
          <span>Advanced</span>
          <span className={`disclosure-chevron ${openPanel === 'advanced' ? 'is-open' : ''}`}>
            ▾
          </span>
        </button>

        <button
          className={`ghost-button ghost-button-dark disclosure-button ${openPanel === 'logs' ? 'is-open' : ''}`}
          onClick={() =>
            setOpenPanel((currentPanel) => (currentPanel === 'logs' ? null : 'logs'))
          }
          type="button"
        >
          <IconAsset className="button-icon section-icon-inverted" src={cliIconMidnight} />
          <span>Run log</span>
          <span className={`disclosure-chevron ${openPanel === 'logs' ? 'is-open' : ''}`}>
            ▾
          </span>
        </button>
      </div>

      {openPanel === 'advanced' ? (
        <>
          <DetailSection
            iconSrc={pipelineIconWhite}
            items={throughputAdvancedItems}
            title="Throughput"
          />
          <DetailSection iconSrc={latencyIconWhite} items={latencyAdvancedItems} title="Latency" />
          <DetailSection
            iconSrc={databaseWhiteIcon}
            items={connectionAdvancedItems}
            title="Connections"
          />

          <div className="chart-grid-layout chart-grid-layout-advanced">
            <TimeseriesChart
              color="#7eb8d5"
              formatter={formatBytesPerSecond}
              iconSrc={pipelineIconWhite}
              points={bytesSeries}
              title="bytes/sec"
            />

            <TimeseriesChart
              color="#cbd6dc"
              formatter={formatConnections}
              iconSrc={databaseWhiteIcon}
              points={connectionsSeries}
              title="connections"
            />

            <TimeseriesChart
              color="#ff8474"
              emptyValue="0"
              emptyVariant="number"
              formatter={formatConnections}
              hideValueWhenEmpty
              iconSrc={databaseWhiteIcon}
              points={connectionErrorsSeries}
              title="connection errors"
            />
          </div>

          <SummaryTable summary={run.summary} />
        </>
      ) : null}

      {openPanel === 'logs' ? (
        <section className="log-panel">
          <div className="panel-header">
            <p className="eyebrow">Run log</p>
          </div>
          <LogConsole logs={run.logs} />
        </section>
      ) : null}
    </section>
  );
}

export default function App() {
  const [appState, setAppState] = useState(EMPTY_APP_STATE);
  const [appMeta, setAppMeta] = useState(EMPTY_META);
  const [setupState, setSetupState] = useState(EMPTY_SETUP_STATE);
  const [formState, setFormState] = useState(DEFAULT_FORM);
  const [drafts, setDrafts] = useState([]);
  const [compareMode, setCompareMode] = useState(false);
  const [compareView, setCompareView] = useState(false);
  const [selectedComparisonRunIds, setSelectedComparisonRunIds] = useState([]);
  const [selectedDraftId, setSelectedDraftId] = useState(null);
  const [connectPending, setConnectPending] = useState(false);
  const [runPendingDraftId, setRunPendingDraftId] = useState(null);
  const [connectError, setConnectError] = useState('');
  const draftNumberRef = useRef(1);

  const connections = appState.connections ?? [];
  const selectedConnection =
    connections.find((connection) => connection.id === appState.selectedConnectionId) ??
    connections[0] ??
    null;
  const runningRuns = appState.runs.filter((run) => run.status === 'running');
  const hasRunningRuns = runningRuns.length > 0;
  const runningRun = runningRuns.at(-1) ?? null;
  const latestRun = appState.runs.at(-1) ?? null;
  const scenarioMap = new Map(appState.scenarios.map((scenario) => [scenario.id, scenario]));
  const runById = new Map(appState.runs.map((run) => [run.id, run]));
  const draftByRunId = new Map(
    drafts.filter((draft) => draft.runId).map((draft) => [draft.runId, draft]),
  );
  const hasReadyDraft = drafts.some((draft) => !draft.runId);
  const canClear =
    !hasRunningRuns &&
    runPendingDraftId === null &&
    (drafts.length > 0 || compareMode || compareView);
  const completedRuns = appState.runs.filter((run) => run.status === 'completed');
  const canOpenCompareMode =
    completedRuns.length >= 2 && !hasRunningRuns && runPendingDraftId === null;
  const comparedRuns = selectedComparisonRunIds
    .map((runId) => {
      const run = runById.get(runId);
      return run
        ? {
            run,
            draft: draftByRunId.get(runId) ?? null,
          }
        : null;
    })
    .filter(Boolean);
  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId) ?? null;
  const selectedRun = selectedDraft?.runId ? runById.get(selectedDraft.runId) ?? null : null;
  const displayRun = selectedRun ?? runningRun ?? latestRun;
  const displayDraftPreview =
    selectedDraft && !selectedDraft.runId
      ? {
          draft: selectedDraft,
          scenario: scenarioMap.get(selectedDraft.scenarioId) ?? null,
        }
      : null;

  function createDraft(scenario, options = {}) {
    const number = options.number ?? draftNumberRef.current++;
    return {
      id: createDraftId(),
      number,
      name: options.name ?? buildDefaultDraftName(scenario.name, number),
      connectionId: options.connectionId ?? null,
      scenarioId: scenario.id,
      config: { ...scenario.defaults, ...(options.config ?? {}) },
      isCustomizing: Boolean(options.isCustomizing),
      runId: options.runId ?? null,
    };
  }

  useEffect(() => {
    if (!appState.scenarios.length) {
      return;
    }

    setDrafts((currentDrafts) => {
      let nextDrafts = currentDrafts;
      let changed = false;

      for (const run of appState.runs) {
        if (nextDrafts.some((draft) => draft.runId === run.id)) {
          continue;
        }

        const scenario = scenarioMap.get(run.scenarioId) ?? appState.scenarios[0];
        nextDrafts = [
          ...nextDrafts,
          createDraft(scenario, {
            config: run.scenarioConfig,
            connectionId: run.connectionId,
            name: run.displayName ?? run.scenarioName,
            runId: run.id,
          }),
        ];
        changed = true;
      }

      return changed ? nextDrafts : currentDrafts;
    });
  }, [appState.runs, appState.scenarios]);

  useEffect(() => {
    setSelectedComparisonRunIds((currentIds) =>
      currentIds.filter((runId) => runById.get(runId)?.status === 'completed'),
    );
  }, [appState.runs]);

  useEffect(() => {
    if (!drafts.length) {
      return;
    }

    setSelectedDraftId((currentDraftId) => {
      if (currentDraftId && drafts.some((draft) => draft.id === currentDraftId)) {
        return currentDraftId;
      }

      const preferredRunId = runningRun?.id ?? latestRun?.id ?? null;
      if (preferredRunId) {
        const preferredDraft = drafts.find((draft) => draft.runId === preferredRunId);
        if (preferredDraft) {
          return preferredDraft.id;
        }
      }

      return drafts[0].id;
    });
  }, [drafts, latestRun?.id, runningRun?.id]);

  const socketMessageHandler = useEffectEvent((event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'setup_state') {
      startTransition(() => {
        setSetupState(message.setup ?? EMPTY_SETUP_STATE);
      });
      return;
    }

    startTransition(() => {
      setAppState((currentState) => reduceSocketMessage(currentState, message));
    });
  });

  useEffect(() => {
    fetch('/api/state')
      .then((response) => response.json())
      .then((state) => {
        startTransition(() => {
          setAppState(state);
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/setup')
      .then((response) => response.json())
      .then((payload) => {
        startTransition(() => {
          setSetupState(payload.setup ?? EMPTY_SETUP_STATE);
        });
      })
      .catch(() => {});

    fetch('/api/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force: false }),
    })
      .then((response) => response.json())
      .then((payload) => {
        startTransition(() => {
          setSetupState(payload.setup ?? EMPTY_SETUP_STATE);
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!['idle', 'running'].includes(setupState.status)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      fetch('/api/setup')
        .then((response) => response.json())
        .then((payload) => {
          startTransition(() => {
            setSetupState(payload.setup ?? EMPTY_SETUP_STATE);
          });
        })
        .catch(() => {});
    }, 700);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [setupState.status]);

  useEffect(() => {
    if (!connections.length && !hasRunningRuns) {
      return;
    }

    const intervalId = window.setInterval(() => {
      fetch('/api/state')
        .then((response) => response.json())
        .then((state) => {
          startTransition(() => {
            setAppState(state);
          });
        })
        .catch(() => {});
    }, hasRunningRuns ? 1000 : 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [connections.length, hasRunningRuns]);

  useEffect(() => {
    fetch('/api/meta')
      .then((response) => response.json())
      .then((meta) => {
        startTransition(() => {
          setAppMeta({
            appVersion: meta.appVersion ?? EMPTY_META.appVersion,
            appPort: meta.appPort ?? EMPTY_META.appPort,
            appUrl: meta.appUrl ?? EMPTY_META.appUrl,
            memtier: {
              version: meta.memtier?.version ?? null,
              minimumVersion: meta.memtier?.minimumVersion ?? EMPTY_META.memtier.minimumVersion,
              repoUrl: meta.memtier?.repoUrl ?? EMPTY_META.memtier.repoUrl,
            },
          });
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    socket.addEventListener('message', socketMessageHandler);

    return () => {
      socket.removeEventListener('message', socketMessageHandler);
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [socketMessageHandler]);

  function handleFormChange(event) {
    const { name, value } = event.target;
    setFormState((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
    setConnectError('');
  }

  function handleScenarioConfigChange(scenarioId, field, nextValue) {
    const draft = drafts.find((entry) => entry.id === scenarioId);
    const scenario = draft ? scenarioMap.get(draft.scenarioId) : null;
    if (!scenario || !draft) {
      return;
    }

    if (field === 'limitMode' || field === 'rateLimitEnabled') {
      setDrafts((currentDrafts) =>
        currentDrafts.map((entry) =>
          entry.id === scenarioId
            ? {
                ...entry,
                config: {
                  ...entry.config,
                  [field]: nextValue,
                },
              }
            : entry,
        ),
      );
      return;
    }

    const limits = scenario.limits[field];
    if (!limits) {
      return;
    }

    setDrafts((currentDrafts) =>
      currentDrafts.map((entry) =>
        entry.id === scenarioId
          ? {
              ...entry,
              config: {
                ...entry.config,
                [field]: clampValue(nextValue, limits),
              },
            }
          : entry,
      ),
    );
  }

  async function handleConnect(event) {
    event.preventDefault();
    if (setupState.status !== 'ready') {
      return;
    }

    setConnectPending(true);
    setConnectError('');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify(formState),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? 'Connection failed.');
      }

      startTransition(() => {
        setAppState(payload.state ?? EMPTY_APP_STATE);
      });
      setFormState(BLANK_CONNECTION_FORM);
    } catch (error) {
      if (error.name === 'AbortError') {
        setConnectError(
          'Connection attempt timed out after 3 seconds. Check the host, port, and credentials.',
        );
      } else {
        setConnectError(error.message);
      }
    } finally {
      window.clearTimeout(timeoutId);
      setConnectPending(false);
    }
  }

  async function handleDisconnect(connectionId) {
    setConnectError('');
    const response = await fetch('/api/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ connectionId }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setConnectError(payload.error ?? 'Disconnect failed.');
      return;
    }

    startTransition(() => {
      setAppState(payload.state ?? EMPTY_APP_STATE);
    });
    setCompareMode(false);
    setCompareView(false);
    setSelectedComparisonRunIds([]);
  }

  async function handleSelectConnection(connectionId) {
    setConnectError('');

    try {
      const response = await fetch('/api/connections/select', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ connectionId }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not select that connection.');
      }

      startTransition(() => {
        setAppState(payload.state ?? EMPTY_APP_STATE);
      });
    } catch (error) {
      setConnectError(error.message);
    }
  }

  async function handleRenameConnection(connectionId, name) {
    setConnectError('');

    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not rename that connection.');
      }

      startTransition(() => {
        setAppState(payload.state ?? EMPTY_APP_STATE);
      });
    } catch (error) {
      setConnectError(error.message);
    }
  }

  function handleOpenRedisInsight(redisInsightUrl) {
    if (!redisInsightUrl) {
      return;
    }

    window.location.assign(redisInsightUrl);
  }

  function handlePrepareAddConnection() {
    setFormState(BLANK_CONNECTION_FORM);
    setConnectError('');
  }

  async function handleRun(draftId, scope = 'selected') {
    setConnectError('');
    setRunPendingDraftId(draftId);

    try {
      const draft = drafts.find((entry) => entry.id === draftId);
      if (!draft) {
        throw new Error('Could not find the selected test.');
      }

      const response = await fetch('/api/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scenarioId: draft.scenarioId,
          config: draft.config,
          name: draft.name,
          scope,
          connectionId: selectedConnection?.id ?? null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? 'Run failed to start.');
      }

      if (payload.runs?.length) {
        startTransition(() => {
          setAppState((currentState) => {
            let runs = currentState.runs;
            for (const run of payload.runs) {
              runs = upsertRun(runs, run);
            }

            return {
              ...currentState,
              activeRunIds: getActiveRunIdsFromRuns(runs),
              runs,
            };
          });
        });
      }

      if (scope === 'all' && payload.runs?.length) {
        const scenario = scenarioMap.get(draft.scenarioId);
        const preferredRun =
          payload.runs.find((run) => run.connectionId === selectedConnection?.id) ?? payload.runs[0];

        if (scenario) {
          const generatedDrafts = payload.runs.map((run) =>
            createDraft(scenario, {
              config: run.scenarioConfig,
              connectionId: run.connectionId,
              name: draft.name,
              runId: run.id,
            }),
          );

          setDrafts((currentDrafts) => [
            ...generatedDrafts,
            ...currentDrafts.filter((entry) => entry.id !== draftId),
          ]);

          const preferredDraft = generatedDrafts.find((entry) => entry.runId === preferredRun?.id);
          setSelectedDraftId(preferredDraft?.id ?? draftId);
        }
      } else {
        const nextRun = payload.runs?.[0] ?? null;
        setDrafts((currentDrafts) =>
          currentDrafts.map((entry) =>
            entry.id === draftId
              ? {
                  ...entry,
                  connectionId: nextRun?.connectionId ?? entry.connectionId,
                  isCustomizing: false,
                  runId: nextRun?.id ?? entry.runId,
                }
              : entry,
          ),
        );
        setSelectedDraftId(draftId);
      }
    } catch (error) {
      setConnectError(error.message);
    } finally {
      setRunPendingDraftId(null);
    }
  }

  const validationError = validateConnectionForm(formState);
  const connectDisabled =
    Boolean(validationError) ||
    connectPending ||
    setupState.status !== 'ready' ||
    hasRunningRuns ||
    connections.length >= 3;

  async function handleRetrySetup() {
    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force: true }),
      });
      const payload = await response.json();

      startTransition(() => {
        setSetupState(payload.setup ?? EMPTY_SETUP_STATE);
      });
    } catch {
      startTransition(() => {
        setSetupState((currentSetup) => ({
          ...currentSetup,
          status: 'error',
          error: 'Could not restart setup. Try refreshing the page.',
        }));
      });
    }
  }

  function handleToggleCustomize(draftId) {
    setDrafts((currentDrafts) =>
      currentDrafts.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              isCustomizing: !draft.isCustomizing,
            }
          : draft,
      ),
    );
  }

  function handleRenameDraft(draftId, nextName) {
    setDrafts((currentDrafts) =>
      currentDrafts.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              name: nextName,
            }
          : draft,
      ),
    );
  }

  function handleNewTest(scenarioId) {
    if (hasReadyDraft || !appState.scenarios.length || !connections.length) {
      return;
    }

    const scenario = scenarioMap.get(scenarioId) ?? appState.scenarios[0];
    const nextDraft = createDraft(scenario);
    setCompareMode(false);
    setCompareView(false);
    setSelectedComparisonRunIds([]);
    setDrafts((currentDrafts) => [nextDraft, ...currentDrafts]);
    setSelectedDraftId(nextDraft.id);
  }

  async function handleClear() {
    setConnectError('');

    try {
      const response = await fetch('/api/clear', {
        method: 'POST',
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Clear failed.');
      }

      startTransition(() => {
        setAppState(payload.state ?? EMPTY_APP_STATE);
      });

      setCompareMode(false);
      setCompareView(false);
      setSelectedComparisonRunIds([]);
      setDrafts([]);
      setSelectedDraftId(null);
    } catch (error) {
      setConnectError(error.message);
    }
  }

  function handleToggleCompareMode() {
    if (compareView) {
      setCompareMode(false);
      setCompareView(false);
      setSelectedComparisonRunIds([]);
      return;
    }

    setCompareMode((currentMode) => {
      const nextMode = !currentMode;
      if (!nextMode) {
        setSelectedComparisonRunIds([]);
        setCompareView(false);
      }
      return nextMode;
    });
  }

  function handleToggleCompareSelection(runId) {
    setSelectedComparisonRunIds((currentIds) => {
      let nextIds;

      if (currentIds.includes(runId)) {
        nextIds = currentIds.filter((currentId) => currentId !== runId);
      } else if (currentIds.length < 5) {
        nextIds = [...currentIds, runId];
      } else {
        nextIds = currentIds;
      }

      setCompareView(false);
      return nextIds;
    });
  }

  function handleCompareSelected() {
    if (selectedComparisonRunIds.length >= 2) {
      setCompareMode(false);
      setCompareView(true);
    }
  }

  function handleSelectDraft(draftId) {
    setSelectedDraftId(draftId);
    setCompareView(false);
  }

  return (
    <div className="app-shell">
      <TopBar
        connectDisabled={connectDisabled}
        connectPending={connectPending}
        connections={connections}
        formState={formState}
        hasRunningRuns={hasRunningRuns}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onFormChange={handleFormChange}
        onPrepareAddConnection={handlePrepareAddConnection}
        onOpenRedisInsight={handleOpenRedisInsight}
        onRenameConnection={handleRenameConnection}
        onSelectConnection={handleSelectConnection}
        selectedConnectionId={selectedConnection?.id ?? null}
        setup={setupState}
      />
      {connectError || validationError ? (
        <div className="error-banner">{connectError || validationError}</div>
      ) : null}

      {connections.length ? (
        <main className="workspace">
          <ScenarioList
            canCreateDraft={!hasReadyDraft}
            canClear={canClear}
            canOpenCompareMode={canOpenCompareMode}
            compareMode={compareMode}
            compareView={compareView}
            connections={connections}
            drafts={drafts}
            hasRunningRuns={hasRunningRuns}
            onClear={handleClear}
            onCompareSelected={handleCompareSelected}
            onRename={handleRenameDraft}
            onSelect={handleSelectDraft}
            onToggleCompareMode={handleToggleCompareMode}
            onToggleCompareSelection={handleToggleCompareSelection}
            onNewTest={handleNewTest}
            onConfigChange={handleScenarioConfigChange}
            onRun={handleRun}
            scenarios={appState.scenarios}
            onToggleCustomize={handleToggleCustomize}
            runById={runById}
            runPendingDraftId={runPendingDraftId}
            scenarioMap={scenarioMap}
            selectedComparisonRunIds={selectedComparisonRunIds}
            selectedConnectionName={selectedConnection?.name ?? null}
            selectedDraftId={selectedDraftId}
          />

          {compareView ? (
            <ComparePanel comparedRuns={comparedRuns} />
          ) : displayDraftPreview?.scenario ? (
            <DraftPreviewPanel
              draft={displayDraftPreview.draft}
              scenario={displayDraftPreview.scenario}
            />
          ) : (
            <MetricsPanel
              draft={displayRun ? draftByRunId.get(displayRun.id) ?? null : null}
              run={displayRun}
            />
          )}
        </main>
      ) : setupState.status !== 'ready' ? (
        <main className="workspace workspace-blank">
          <SetupPanel onRetry={handleRetrySetup} setup={setupState} />
        </main>
      ) : (
        <main className="workspace workspace-blank" />
      )}

      <footer className="app-footer">
        <span>memviz {appMeta.appVersion}</span>
        <span>
          based on{' '}
          <a href={appMeta.memtier.repoUrl} rel="noreferrer" target="_blank">
            memtier_benchmark {setupState.version ?? appMeta.memtier.version ?? 'unknown'}
          </a>
        </span>
        <span>running on port {setupState.appPort ?? appMeta.appPort}</span>
      </footer>
    </div>
  );
}
