import { serializeConnectionTarget } from './redis-target.js';
import { applySummaryLine, createEmptySummary } from './memtier-summary.js';

const MAX_SERIES_POINTS = 240;
const MAX_LOG_LINES = 600;

function createEmptyMetrics() {
  return {
    ops_sec: null,
    ops_sec_avg: null,
    bytes_sec: null,
    bytes_sec_avg: null,
    latency_ms: null,
    latency_avg_ms: null,
    latency_p50: null,
    latency_p90: null,
    latency_p99: null,
    latency_p99_9: null,
    connections: null,
    progress_pct: 0,
    connection_errors: 0,
  };
}

const state = {
  connection: null,
  activeRunId: null,
  runs: new Map(),
};

export function setConnectionTarget(target) {
  state.connection = target;
}

export function clearConnectionTarget() {
  state.connection = null;
}

export function clearRuns() {
  state.activeRunId = null;
  state.runs.clear();
}

export function getConnectionTarget() {
  return state.connection;
}

export function getActiveRunId() {
  return state.activeRunId;
}

export function getRun(id) {
  return state.runs.get(id) ?? null;
}

export function createRun({ command, displayName = null, id, label, scenario, target }) {
  const timestamp = new Date().toISOString();
  const run = {
    id,
    label,
    displayName,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    scenarioDescription: scenario.description,
    scenarioConfig: { ...scenario.config },
    target: serializeConnectionTarget(target),
    status: 'running',
    createdAt: timestamp,
    startedAt: timestamp,
    endedAt: null,
    exitCode: null,
    error: null,
    command,
    metrics: createEmptyMetrics(),
    series: {
      ops_sec: [],
      latency_ms: [],
      bytes_sec: [],
      connections: [],
      connection_errors: [],
    },
    summary: createEmptySummary(),
    logs: [],
  };

  state.runs.set(id, run);
  state.activeRunId = id;
  return run;
}

export function appendLog(runId, { stream, text }) {
  const run = getRun(runId);
  if (!run) {
    return null;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    stream,
    text,
  };

  run.logs.push(entry);
  if (run.logs.length > MAX_LOG_LINES) {
    run.logs.splice(0, run.logs.length - MAX_LOG_LINES);
  }

  return entry;
}

function recordSeriesPoint(series, point) {
  series.push(point);
  if (series.length > MAX_SERIES_POINTS) {
    series.splice(0, series.length - MAX_SERIES_POINTS);
  }
}

export function recordMetric(runId, { metric, value, timestamp }) {
  const run = getRun(runId);
  if (!run) {
    return null;
  }

  if (
    (metric === 'ops_sec_avg' || metric === 'bytes_sec_avg') &&
    value === 0 &&
    run.metrics[metric] !== null &&
    run.metrics[metric] > 0
  ) {
    return run;
  }

  if (metric === 'progress_pct') {
    run.metrics.progress_pct = Math.max(0, Math.min(100, value));
  } else if (metric === 'connection_errors') {
    run.metrics.connection_errors = value;
  } else {
    run.metrics[metric] = value;
  }

  if (
    metric === 'ops_sec' ||
    metric === 'latency_ms' ||
    metric === 'bytes_sec' ||
    metric === 'connections' ||
    metric === 'connection_errors'
  ) {
    recordSeriesPoint(run.series[metric], { timestamp, value });
  }

  return run;
}

export function recordSummaryLine(runId, line) {
  const run = getRun(runId);
  if (!run) {
    return null;
  }

  const changed = applySummaryLine(run.summary, line);
  return changed ? run : null;
}

export function finishRun(runId, { status, exitCode = null, error = null }) {
  const run = getRun(runId);
  if (!run) {
    return null;
  }

  run.status = status;
  run.exitCode = exitCode;
  run.error = error;
  run.endedAt = new Date().toISOString();

  if (state.activeRunId === runId) {
    state.activeRunId = null;
  }

  return run;
}

export function serializeRun(run, { includeLogs = true } = {}) {
  return {
    id: run.id,
    label: run.label,
    displayName: run.displayName,
    scenarioId: run.scenarioId,
    scenarioName: run.scenarioName,
    scenarioDescription: run.scenarioDescription,
    scenarioConfig: { ...run.scenarioConfig },
    target: run.target,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    exitCode: run.exitCode,
    error: run.error,
    command: run.command,
    metrics: { ...run.metrics },
    series: {
      ops_sec: [...run.series.ops_sec],
      latency_ms: [...run.series.latency_ms],
      bytes_sec: [...run.series.bytes_sec],
      connections: [...run.series.connections],
      connection_errors: [...run.series.connection_errors],
    },
    summary: {
      config: { ...run.summary.config },
      results: Object.fromEntries(
        Object.entries(run.summary.results).map(([key, value]) => [key, { ...value }]),
      ),
    },
    logs: includeLogs ? [...run.logs] : undefined,
  };
}

export function getStateSnapshot() {
  const runs = Array.from(state.runs.values())
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-5)
    .map((run) => serializeRun(run));

  return {
    connection: serializeConnectionTarget(state.connection),
    activeRunId: state.activeRunId,
    runs,
  };
}
