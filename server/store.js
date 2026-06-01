import { buildRedisInsightUrl, serializeConnectionTarget } from './redis-target.js';
import { applySummaryLine, createEmptySummary } from './memtier-summary.js';
import { normalizeDatabaseSource } from '../shared/database-source.js';

const MAX_SERIES_POINTS = 240;
const MAX_LOG_LINES = 600;
const MAX_SNAPSHOT_RUNS = 60;

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
  connections: new Map(),
  connectionOrder: [],
  selectedConnectionId: null,
  runs: new Map(),
};

function createEmptyLoadState() {
  return {
    status: 'idle',
    progressPct: 0,
    message: '',
    error: null,
    startedAt: null,
    endedAt: null,
    presetName: null,
    summary: null,
  };
}

function sanitizeName(name, fallback) {
  const trimmed = String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  return trimmed || fallback;
}

function serializeConnection(connection) {
  if (!connection) {
    return null;
  }

  return {
    id: connection.id,
    name: connection.name,
    createdAt: connection.createdAt,
    rttMs: connection.rttMs ?? null,
    rttWarning: Boolean(connection.rttWarning),
    databaseSource: normalizeDatabaseSource(connection.databaseSource),
    redisInsightUrl: buildRedisInsightUrl(connection.target, {
      databaseAlias: connection.name,
    }),
    load: {
      ...connection.load,
      summary: connection.load.summary ? { ...connection.load.summary } : null,
    },
    ...serializeConnectionTarget(connection.target),
  };
}

function getOrderedConnections() {
  return state.connectionOrder
    .map((connectionId) => state.connections.get(connectionId))
    .filter(Boolean);
}

function recordSeriesPoint(series, point) {
  series.push(point);
  if (series.length > MAX_SERIES_POINTS) {
    series.splice(0, series.length - MAX_SERIES_POINTS);
  }
}

export function createConnection({ databaseSource = {}, id, name, target }) {
  const connection = {
    id,
    name: sanitizeName(name, target.summary),
    target,
    databaseSource: normalizeDatabaseSource(databaseSource),
    createdAt: new Date().toISOString(),
    rttMs: null,
    rttWarning: false,
    load: createEmptyLoadState(),
  };

  state.connections.set(id, connection);
  state.connectionOrder.push(id);
  state.selectedConnectionId = id;
  return serializeConnection(connection);
}

export function updateConnectionRtt(connectionId, rttMs) {
  const connection = state.connections.get(connectionId);
  if (!connection) {
    return null;
  }

  connection.rttMs = Number.isFinite(rttMs) ? rttMs : null;
  connection.rttWarning = Number.isFinite(rttMs) ? rttMs > 10 : false;
  return serializeConnection(connection);
}

export function renameConnection(connectionId, name) {
  const connection = state.connections.get(connectionId);
  if (!connection) {
    return null;
  }

  connection.name = sanitizeName(name, connection.target.summary);
  return serializeConnection(connection);
}

export function removeConnection(connectionId) {
  const connection = state.connections.get(connectionId);
  if (!connection) {
    return null;
  }

  state.connections.delete(connectionId);
  state.connectionOrder = state.connectionOrder.filter((id) => id !== connectionId);

  if (state.selectedConnectionId === connectionId) {
    state.selectedConnectionId = state.connectionOrder[0] ?? null;
  }

  return serializeConnection(connection);
}

export function selectConnection(connectionId) {
  if (!state.connections.has(connectionId)) {
    return null;
  }

  state.selectedConnectionId = connectionId;
  return serializeConnection(state.connections.get(connectionId));
}

export function clearConnections() {
  state.connections.clear();
  state.connectionOrder = [];
  state.selectedConnectionId = null;
}

export function getConnections() {
  return getOrderedConnections();
}

export function getConnection(connectionId) {
  return state.connections.get(connectionId) ?? null;
}

export function getSelectedConnection() {
  if (!state.selectedConnectionId) {
    return null;
  }

  return state.connections.get(state.selectedConnectionId) ?? null;
}

export function hasActiveLoads() {
  return getOrderedConnections().some((connection) => connection.load.status === 'running');
}

export function startConnectionLoad(connectionId, { presetName = null } = {}) {
  const connection = state.connections.get(connectionId);
  if (!connection) {
    return null;
  }

  connection.load = {
    status: 'running',
    progressPct: 0,
    message: 'Preparing dataset',
    error: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    presetName,
    summary: null,
  };

  return serializeConnection(connection);
}

export function updateConnectionLoad(connectionId, patch = {}) {
  const connection = state.connections.get(connectionId);
  if (!connection) {
    return null;
  }

  connection.load = {
    ...connection.load,
    ...patch,
    progressPct:
      patch.progressPct === undefined
        ? connection.load.progressPct
        : Math.max(0, Math.min(100, Number(patch.progressPct) || 0)),
    summary:
      patch.summary === undefined
        ? connection.load.summary
        : patch.summary
          ? { ...patch.summary }
          : null,
  };

  return serializeConnection(connection);
}

export function finishConnectionLoad(connectionId, { error = null, message = '', summary = null }) {
  const connection = state.connections.get(connectionId);
  if (!connection) {
    return null;
  }

  connection.load = {
    ...connection.load,
    status: error ? 'failed' : 'completed',
    progressPct: error ? connection.load.progressPct : 100,
    message,
    error,
    endedAt: new Date().toISOString(),
    summary: summary ? { ...summary } : connection.load.summary,
  };

  return serializeConnection(connection);
}

export function clearRuns() {
  state.runs.clear();
}

export function removeRuns(runIds = []) {
  for (const runId of runIds) {
    state.runs.delete(runId);
  }
}

export function getRun(id) {
  return state.runs.get(id) ?? null;
}

export function getRunningRuns() {
  return Array.from(state.runs.values()).filter((run) => run.status === 'running');
}

export function hasRunningRuns() {
  return getRunningRuns().length > 0;
}

export function getActiveRunIds() {
  return getRunningRuns().map((run) => run.id);
}

export function createRun({ command, connection, displayName = null, id, label, scenario }) {
  const timestamp = new Date().toISOString();
  const run = {
    id,
    label,
    displayName,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    scenarioDescription: scenario.description,
    scenarioConfig: { ...scenario.config },
    connectionId: connection.id,
    connectionName: connection.name,
    databaseSource: normalizeDatabaseSource(connection.databaseSource),
    target: serializeConnectionTarget(connection.target),
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
      latency_p50: [],
      latency_p90: [],
      latency_p99: [],
      bytes_sec: [],
      connections: [],
      connection_errors: [],
    },
    summary: createEmptySummary(),
    logs: [],
  };

  state.runs.set(id, run);
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

  if (
    metric.startsWith('latency_') &&
    value === 0 &&
    run.metrics[metric] !== null &&
    run.metrics[metric] > 0
  ) {
    return run;
  }

  if (metric === 'progress_pct') {
    if (run.status !== 'running') {
      return run;
    }

    const nextProgress = Math.max(0, Math.min(100, value));
    run.metrics.progress_pct = Math.max(run.metrics.progress_pct, nextProgress);
  } else if (metric === 'connection_errors') {
    run.metrics.connection_errors = value;
  } else {
    run.metrics[metric] = value;
  }

  if (
    metric === 'ops_sec' ||
    metric === 'latency_ms' ||
    metric === 'latency_p50' ||
    metric === 'latency_p90' ||
    metric === 'latency_p99' ||
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
    connectionId: run.connectionId,
    connectionName: run.connectionName,
    databaseSource: normalizeDatabaseSource(run.databaseSource),
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
      latency_p50: [...run.series.latency_p50],
      latency_p90: [...run.series.latency_p90],
      latency_p99: [...run.series.latency_p99],
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
    .slice(-MAX_SNAPSHOT_RUNS)
    .map((run) => serializeRun(run));

  return {
    connections: getOrderedConnections().map(serializeConnection),
    selectedConnectionId: state.selectedConnectionId,
    activeRunIds: getActiveRunIds(),
    activeLoadConnectionIds: getOrderedConnections()
      .filter((connection) => connection.load.status === 'running')
      .map((connection) => connection.id),
    runs,
  };
}
