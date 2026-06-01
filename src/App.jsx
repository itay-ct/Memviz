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
import { parseDocument } from 'yaml';
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
import settingsIconMidnight from './assets/icons/redis/settings-midnight.svg';
import settingsIconWhite from './assets/icons/redis/settings-white.svg';
import { BLANK_DATASET_YAML, BLANK_STORAGE_YAML } from './datasetPresets.js';
import { applyScenarioDraftConfigChange } from './scenarioDraftConfig.js';
import {
  estimateAverageActiveClientsPerThread,
  estimateStaircaseThroughput,
  formatLoadProfileSummary,
  getMinimumRampDurationSeconds,
  getReachedClientsPerThreadAtTime,
  hasStaircaseProfile,
} from '../shared/scenario-load-profile.js';
import {
  DATABASE_ENGINE_OPTIONS,
  DATABASE_SERVICE_OPTIONS,
  getDatabaseEngineLabel,
  getDatabaseServiceLabel,
  normalizeDatabaseSource,
} from '../shared/database-source.js';
import {
  MEMTIER_ADVANCED_OPTION_GROUPS,
  countEnabledMemtierAdvancedOptions,
} from '../shared/memtier-options.js';

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

function PopOutIcon() {
  return (
    <svg aria-hidden="true" className="popout-icon" viewBox="0 0 16 16">
      <path
        d="M6.2 3.2H3.8c-.7 0-1.2.5-1.2 1.2v7.8c0 .7.5 1.2 1.2 1.2h7.8c.7 0 1.2-.5 1.2-1.2V9.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M9.1 2.6h4.3v4.3M8.2 7.8l5-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function RunningIndicator() {
  return (
    <span aria-label="Running" className="scenario-running-indicator" role="status">
      <span className="scenario-running-ring scenario-running-ring-outer" />
      <span className="scenario-running-ring scenario-running-ring-inner" />
    </span>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" className="more-icon" viewBox="0 0 16 16">
      <circle cx="3.25" cy="8" r="1.15" fill="currentColor" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" />
      <circle cx="12.75" cy="8" r="1.15" fill="currentColor" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="trash-icon" viewBox="0 0 16 16">
      <path
        d="M5.25 4.25V3.4c0-.7.48-1.15 1.2-1.15h3.1c.72 0 1.2.45 1.2 1.15v.85"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path
        d="M3.35 4.45h9.3M4.55 6l.45 6.15c.05.78.55 1.2 1.3 1.2h3.4c.75 0 1.25-.42 1.3-1.2L11.45 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path
        d="M6.85 7.05v4.05M9.15 7.05v4.05"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.25"
      />
    </svg>
  );
}

function RedisStackIcon() {
  return (
    <svg aria-hidden="true" className="source-engine-icon source-engine-icon-redis" viewBox="0 0 20 20">
      <path className="redis-stack-layer redis-stack-bottom" d="M2 13.1 10 9.25 18 13.1 10 17.35Z" />
      <path className="redis-stack-layer redis-stack-middle" d="M2 10.15 10 6.3 18 10.15 10 14.4Z" />
      <path className="redis-stack-layer redis-stack-top" d="M2 7.1 10 3.15 18 7.1 10 11.35Z" />
      <ellipse className="redis-stack-cutout" cx="6.9" cy="7" rx="2.2" ry="0.86" />
      <path className="redis-stack-cutout" d="M10.6 4.5 11.3 5.95 12.9 6.1 11.7 7.15 12.05 8.65 10.6 7.85 9.2 8.65 9.5 7.15 8.35 6.1 9.95 5.95Z" />
      <path className="redis-stack-cutout" d="M8.4 8.9 12.85 7.9 11.2 10.6Z" />
      <path className="redis-stack-shadow" d="M13.05 6.65 15.65 7.65 13.1 8.75 10.5 7.75Z" />
    </svg>
  );
}

function ValkeySymbolIcon() {
  return (
    <svg aria-hidden="true" className="source-engine-icon source-engine-icon-valkey" viewBox="0 0 20 20">
      <path
        className="valkey-mark"
        d="M10 1.15 17.35 5.4v9.2L10 18.85 2.65 14.6V5.4L10 1.15Zm0 3.1L5.55 6.8v5.75l2.45 1.4v-2.8l-1.2-.68V8.28L10 6.42l3.2 1.86v3.52l-2.16 1.24v2.8l3.4-1.96V6.8L10 4.25Z"
      />
      <circle className="valkey-cutout" cx="10" cy="9.95" r="1.55" />
      <path className="valkey-mark" d="M7.98 10.45 10.35 11.8v5.72L7.98 16.15Z" />
    </svg>
  );
}

const DEFAULT_FORM = {
  hostOrUrl: '127.0.0.1',
  port: '6379',
  username: 'default',
  password: '',
  engine: '',
  service: '',
};

const BLANK_CONNECTION_FORM = {
  hostOrUrl: '',
  port: '',
  username: '',
  password: '',
  engine: '',
  service: '',
};

const EMPTY_APP_STATE = {
  connections: [],
  selectedConnectionId: null,
  activeRunIds: [],
  activeLoadConnectionIds: [],
  runs: [],
  scenarios: [],
  datasetPresets: [],
  presetOptions: [],
  selectedPresetName: '',
  selectedPresetLabel: '',
  canOpenRedisInsight: true,
};

const EMPTY_META = {
  appVersion: '1.3.1',
  appPort: 3000,
  appUrl: 'http://127.0.0.1:3000',
  memtier: {
    version: null,
    minimumVersion: '2.3.0',
    repoUrl: 'https://github.com/RedisLabs/memtier_benchmark',
  },
  redisInsight: {
    mode: 'desktop',
    publicUrl: null,
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

const COMPARE_ENGINE_COLORS = {
  redis: ['#FF4438', '#FF9F1C', '#F72585', '#FFD166'],
  valkey: ['#667EFF', '#00C2FF', '#B967FF', '#2DD4BF'],
};
const COMPARE_FALLBACK_COLORS = ['#81DBFF', '#C895E3', '#DDFF21', '#FFB86B', '#7ED7A5'];
const CUSTOM_DATASET_PRESET = {
  id: 'custom',
  name: 'Custom...',
  recordCount: null,
  totalSize: 'Custom size',
  datasetYaml: BLANK_DATASET_YAML,
  storageYaml: BLANK_STORAGE_YAML,
};
const UPLOAD_PRESET_OPTION = '__upload_preset__';

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
      activeLoadConnectionIds: message.state.activeLoadConnectionIds ?? [],
      runs: message.state.runs ?? [],
      scenarios: message.state.scenarios ?? [],
      datasetPresets: message.state.datasetPresets ?? [],
      presetOptions: message.state.presetOptions ?? [],
      selectedPresetName: message.state.selectedPresetName ?? '',
      selectedPresetLabel: message.state.selectedPresetLabel ?? '',
      canOpenRedisInsight: message.state.canOpenRedisInsight ?? true,
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
    } catch {
      return 'Enter a valid Redis URL.';
    }
  } else {
    const port = Number(formState.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return 'Enter a valid Redis port.';
    }
  }

  if (!isValidDatabaseEngineValue(formState.engine)) {
    return 'Select an engine.';
  }

  if (!isValidDatabaseServiceValue(formState.service)) {
    return 'Select a provider.';
  }

  return '';
}

function isValidDatabaseEngineValue(value) {
  return DATABASE_ENGINE_OPTIONS.some((option) => option.value === value);
}

function isValidDatabaseServiceValue(value) {
  return DATABASE_SERVICE_OPTIONS.some((option) => option.value === value);
}

function isValidRedisPortValue(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function extractHostAndPortFromText(value) {
  const trimmedValue = value.trim();
  if (!trimmedValue || trimmedValue.includes('://')) {
    return null;
  }

  const match = trimmedValue.match(
    /(\[[^\]\s]+\]|[A-Za-z0-9._-]+)\s*:\s*(\d{1,5})(?=$|[/?#\s"'`,;])/,
  );
  if (!match) {
    return null;
  }

  const [, hostOrUrl, port] = match;
  if (!isValidRedisPortValue(port)) {
    return null;
  }

  return {
    hostOrUrl,
    port,
  };
}

function hasConnectionFormInput(formState) {
  return Boolean(
    formState.hostOrUrl.trim() ||
      formState.port.trim() ||
      formState.username.trim() ||
      formState.password.trim() ||
      formState.engine ||
      formState.service,
  );
}

async function readJsonResponse(response, fallbackErrorMessage) {
  const contentType = response.headers.get('content-type') ?? '';
  const rawText = await response.text();

  if (!rawText.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    if (contentType.includes('text/html') || rawText.trim().startsWith('<!doctype')) {
      throw new Error(
        `${fallbackErrorMessage} The server returned HTML instead of JSON. This usually means the backend is out of date, restarting, or the API route was not found.`,
      );
    }

    throw new Error(fallbackErrorMessage);
  }
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

function formatDataVolume(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  const absolute = Math.abs(value);

  if (absolute < 1024) {
    return `${Math.round(value)} B`;
  }

  if (absolute < 1024 * 1024) {
    return `${(value / 1024).toFixed(value >= 1024 * 100 ? 0 : 1)} KB`;
  }

  if (absolute < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(value >= 1024 * 1024 * 100 ? 0 : 1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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

function parseYamlError(text, label) {
  const document = parseDocument(text ?? '');
  if (!document.errors.length) {
    return '';
  }

  return `${label}: ${document.errors[0].message}`.trim();
}

function formatRecordCount(value) {
  if (!Number.isFinite(value)) {
    return 'Custom records';
  }

  return `${formatCompactInteger(value)} records`;
}

function getDatasetPresetOptions(datasetPresets = []) {
  return [...datasetPresets, CUSTOM_DATASET_PRESET];
}

function findDatasetPreset(datasetPresets, presetId) {
  const presets = getDatasetPresetOptions(datasetPresets);
  return presets.find((preset) => preset.id === presetId) ?? presets[0] ?? CUSTOM_DATASET_PRESET;
}

function findDatasetPresetForIndexes(datasetPresets = [], indexes = []) {
  for (const indexName of indexes) {
    const preset = datasetPresets.find((candidate) => candidate.indexes?.includes(indexName));
    if (preset) {
      return preset;
    }
  }

  return findDatasetPreset(datasetPresets, datasetPresets[0]?.id ?? CUSTOM_DATASET_PRESET.id);
}

function findDatasetPresetForScenario(datasetPresets, scenario, indexes = []) {
  if (scenario?.suggestedDatasetPresetId) {
    return findDatasetPreset(datasetPresets, scenario.suggestedDatasetPresetId);
  }

  return findDatasetPresetForIndexes(datasetPresets, indexes);
}

function getRequestedPresetName() {
  const params = new URLSearchParams(window.location.search);
  return params.get('preset')?.trim() ?? '';
}

function updatePresetQueryParam(presetName) {
  const url = new URL(window.location.href);
  const normalizedPresetName = String(presetName ?? '').trim();

  if (normalizedPresetName) {
    url.searchParams.set('preset', normalizedPresetName);
  } else {
    url.searchParams.delete('preset');
  }

  window.history.replaceState({}, '', url);
}

function extractPresetNameFromContents(contents) {
  const document = parseDocument(contents ?? '');
  if (document.errors.length) {
    return {
      error: `Preset file: ${document.errors[0].message}`.trim(),
      name: '',
    };
  }

  const rawPreset = document.toJSON() ?? {};
  const name = String(rawPreset.name ?? '').trim();
  if (!name) {
    return {
      error: 'Preset file: Preset name is required.',
      name: '',
    };
  }

  return {
    error: '',
    name,
  };
}

function formatConnectionNames(connections) {
  return connections.map((connection) => connection.name).join(', ');
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

function getDurationSeconds(startedAt, endedAt) {
  if (!startedAt) {
    return null;
  }

  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  return Math.max(0, (end - start) / 1000);
}

function formatControlValue(field, value) {
  if (field === 'testTime' || field === 'stepDuration') {
    return formatDurationLabel(value);
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

  return formatDurationLabel(config.testTime);
}

function formatCommandPreview(command) {
  const compact = String(command ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (compact.length <= 72) {
    return compact;
  }

  return `${compact.slice(0, 69)}...`;
}

function formatWorkloadMix(config) {
  if (
    config.setRatio === null ||
    config.setRatio === undefined ||
    config.getRatio === null ||
    config.getRatio === undefined
  ) {
    return '—';
  }

  return `${config.setRatio}:${config.getRatio}`;
}

function formatCommandMix(config) {
  if (config.command) {
    return formatCommandPreview(config.command);
  }

  return `${formatWorkloadMix(config)} • ${config.dataSize} B`;
}

function formatKeyPrefixSummary(config) {
  return config.keyPrefix ?? '—';
}

function formatDataSizeSummary(config) {
  if (config.dataSize === null || config.dataSize === undefined) {
    return '—';
  }

  return `${config.dataSize} B`;
}

function formatRateLimitSummary(config) {
  return config.rateLimitEnabled ? `${formatRateLimit(config.rateLimit)} cap` : 'Unlimited';
}

function describeScenarioShape(config) {
  return formatCommandMix(config);
}

function describeDraftConfig(config) {
  const advancedCount = countEnabledMemtierAdvancedOptions(config.memtierAdvanced);

  return [
    formatLoadProfileSummary(config),
    `${config.threads} threads`,
    formatRunLimit(config),
    `pipe ${config.pipeline}`,
    config.clusterModeEnabled ? 'cluster aware' : null,
    `prefix ${formatKeyPrefixSummary(config)}`,
    describeScenarioShape(config),
    config.rateLimitEnabled ? `cap ${formatRateLimit(config.rateLimit)}` : null,
    advancedCount ? `${advancedCount} advanced` : null,
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

function inferScenarioKind(scenario, config) {
  if (scenario?.kind) {
    return scenario.kind;
  }

  return config?.command ? 'command' : 'workload';
}

function getCommandKeyword(command) {
  return String(command ?? '')
    .trim()
    .split(/\s+/)[0]
    ?.toUpperCase() ?? '';
}

function getGeneratedDatasetBytes(run, scenario, config) {
  const scenarioKind = inferScenarioKind(scenario, config);

  if (scenarioKind === 'command') {
    const commandKeyword = getCommandKeyword(config?.command);
    const readOnlyCommands = new Set([
      'GET',
      'MGET',
      'HGET',
      'HGETALL',
      'JSON.GET',
      'FT.SEARCH',
      'FT.AGGREGATE',
      'EXISTS',
      'SCARD',
      'ZRANGE',
      'LRANGE',
      'SMEMBERS',
    ]);

    if (readOnlyCommands.has(commandKeyword)) {
      return 0;
    }

    return null;
  }

  if (
    config?.dataSize === null ||
    config?.dataSize === undefined ||
    config?.setRatio === null ||
    config?.setRatio === undefined ||
    config?.getRatio === null ||
    config?.getRatio === undefined
  ) {
    return null;
  }

  const totalRatio = config.setRatio + config.getRatio;
  if (totalRatio <= 0 || config.setRatio <= 0) {
    return 0;
  }

  const totalClients = (config.clients ?? 0) * (config.threads ?? 0);
  if (totalClients <= 0) {
    return null;
  }

  const writeRatio = config.setRatio / totalRatio;

  if (config.limitMode === 'requests') {
    const writesPerClient = (config.requestCount ?? 0) * writeRatio;
    return config.dataSize * writesPerClient * totalClients;
  }

  const summarySeconds = run?.summary?.config?.seconds ?? null;
  const durationSeconds =
    summarySeconds !== null && summarySeconds !== undefined
      ? Number(summarySeconds)
      : getDurationSeconds(run?.startedAt, run?.endedAt);
  const averageThroughput =
    run?.summary?.results?.totals?.opsSec ??
    run?.metrics?.ops_sec_avg ??
    getSeriesAverage(getDisplaySeries(run, 'ops_sec'));

  if (
    durationSeconds === null ||
    durationSeconds === undefined ||
    Number.isNaN(durationSeconds) ||
    averageThroughput === null ||
    averageThroughput === undefined ||
    Number.isNaN(averageThroughput)
  ) {
    return null;
  }

  return config.dataSize * averageThroughput * durationSeconds * writeRatio;
}

function getGeneratedDatasetDetails(run, scenario, config) {
  const scenarioKind = inferScenarioKind(scenario, config);

  if (scenarioKind === 'command') {
    const bytes = getGeneratedDatasetBytes(run, scenario, config);
    const commandKeyword = getCommandKeyword(config?.command);
    const readOnlyCommands = new Set([
      'GET',
      'MGET',
      'HGET',
      'HGETALL',
      'JSON.GET',
      'FT.SEARCH',
      'FT.AGGREGATE',
      'EXISTS',
      'SCARD',
      'ZRANGE',
      'LRANGE',
      'SMEMBERS',
    ]);

    if (readOnlyCommands.has(commandKeyword)) {
      return {
        bytes: 0,
        tooltip:
          'This test only runs queries against preexisting data and does not generate any new data in Redis.',
      };
    }

    return {
      bytes,
      tooltip:
        'Generated dataset is undefined for this command workload because payload size per write cannot be inferred safely from the command alone.',
    };
  }

  const totalClients = (config.clients ?? 0) * (config.threads ?? 0);
  const totalRatio = (config.setRatio ?? 0) + (config.getRatio ?? 0);
  const writeRatio = totalRatio > 0 ? (config.setRatio ?? 0) / totalRatio : 0;

  if (config.setRatio <= 0 || totalRatio <= 0) {
    return {
      bytes: 0,
      tooltip:
        'Read-only workload.\nGenerated dataset = 0 because the command mix contains no write operations.',
    };
  }

  if (config.limitMode === 'requests') {
    const bytes = getGeneratedDatasetBytes(run, scenario, config);
    const writesPerClient = (config.requestCount ?? 0) * writeRatio;
    return {
      bytes,
      label: 'Generated data',
      tooltip: [
        'Request-based write estimate.',
        `Formula: data size × writes per client × total clients`,
        `= ${config.dataSize} B × ${writesPerClient.toFixed(0)} × ${totalClients}`,
        `Write ratio: ${config.setRatio}:${config.getRatio}`,
      ].join('\n'),
    };
  }

  const summarySeconds = run?.summary?.config?.seconds ?? null;
  const durationSeconds =
    summarySeconds !== null && summarySeconds !== undefined
      ? Number(summarySeconds)
      : getDurationSeconds(run?.startedAt, run?.endedAt);
  const averageThroughput =
    run?.summary?.results?.totals?.opsSec ??
    run?.metrics?.ops_sec_avg ??
    getSeriesAverage(getDisplaySeries(run, 'ops_sec'));

  const hasMeasuredDuration =
    durationSeconds !== null && durationSeconds !== undefined && !Number.isNaN(durationSeconds);
  const hasMeasuredThroughput =
    averageThroughput !== null &&
    averageThroughput !== undefined &&
    !Number.isNaN(averageThroughput);

  if (hasMeasuredDuration && hasMeasuredThroughput) {
    const bytes = config.dataSize * averageThroughput * durationSeconds * writeRatio;

    return {
      bytes,
      label: 'Generated data',
      tooltip: [
        'Time-based generated data.',
        'Formula: data size × average ops/sec × duration × write ratio',
        `= ${config.dataSize} B × ${averageThroughput.toFixed(0)} × ${durationSeconds.toFixed(1)}s × ${(writeRatio * 100).toFixed(0)}%`,
        `Write ratio: ${config.setRatio}:${config.getRatio}`,
      ].join('\n'),
    };
  }

  const configuredDurationSeconds = Number(config.testTime ?? scenario?.defaults?.testTime ?? NaN);
  const hasConfiguredDuration =
    configuredDurationSeconds !== null &&
    configuredDurationSeconds !== undefined &&
    !Number.isNaN(configuredDurationSeconds);
  const configuredRateLimit = Number(config.rateLimit ?? NaN);
  const estimatedScenarioThroughput = Number(scenario?.estimatedOpsPerSec ?? NaN);
  let estimatedThroughput = null;

  if (config.rateLimitEnabled && !Number.isNaN(configuredRateLimit)) {
    estimatedThroughput = !Number.isNaN(estimatedScenarioThroughput)
      ? Math.min(configuredRateLimit, estimatedScenarioThroughput)
      : configuredRateLimit;
  } else if (!Number.isNaN(estimatedScenarioThroughput)) {
    estimatedThroughput = estimatedScenarioThroughput;
  }

  const staircaseAdjustedThroughput = hasStaircaseProfile(config)
    ? estimateStaircaseThroughput(estimatedThroughput, config)
    : estimatedThroughput;

  const hasEstimatedThroughput =
    staircaseAdjustedThroughput !== null &&
    staircaseAdjustedThroughput !== undefined &&
    !Number.isNaN(staircaseAdjustedThroughput);

  if (hasConfiguredDuration && hasEstimatedThroughput) {
    const bytes = config.dataSize * staircaseAdjustedThroughput * configuredDurationSeconds * writeRatio;
    const averageActiveClients = estimateAverageActiveClientsPerThread(config);
    const throughputSource = config.rateLimitEnabled
      ? !Number.isNaN(estimatedScenarioThroughput)
        ? `min(rate limit ${configuredRateLimit.toFixed(0)} ops/sec, preset estimate ${estimatedScenarioThroughput.toFixed(0)} ops/sec)`
        : `rate limit ${configuredRateLimit.toFixed(0)} ops/sec`
      : `preset estimate ${estimatedThroughput.toFixed(0)} ops/sec`;
    const approximationLine =
      hasStaircaseProfile(config) && averageActiveClients
        ? `Approximation: staircase average ${averageActiveClients.toFixed(1)} of ${config.clients} clients/thread.`
        : null;

    return {
      bytes,
      label: 'Estimated data',
      tooltip: [
        hasStaircaseProfile(config)
          ? 'Approximate pre-run estimate for this staircase workload.'
          : 'Pre-run estimate for this time-based write workload.',
        'Formula: data size × estimated ops/sec × duration × write ratio',
        `= ${config.dataSize} B × ${staircaseAdjustedThroughput.toFixed(0)} × ${configuredDurationSeconds.toFixed(1)}s × ${(writeRatio * 100).toFixed(0)}%`,
        `Throughput source: ${throughputSource}`,
        approximationLine,
        `Write ratio: ${config.setRatio}:${config.getRatio}`,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  return {
    bytes: null,
    label: 'Generated data',
    tooltip:
      'Generated data cannot be estimated yet because this time-based write workload has no configured throughput estimate and no live throughput samples yet.',
  };
}

function getEstimatedGeneratedDatasetDetails(scenario, config) {
  const scenarioKind = inferScenarioKind(scenario, config);

  if (scenarioKind === 'command') {
    const commandKeyword = getCommandKeyword(config?.command);
    const readOnlyCommands = new Set([
      'GET',
      'MGET',
      'HGET',
      'HGETALL',
      'JSON.GET',
      'FT.SEARCH',
      'FT.AGGREGATE',
      'EXISTS',
      'SCARD',
      'ZRANGE',
      'LRANGE',
      'SMEMBERS',
    ]);

    if (readOnlyCommands.has(commandKeyword)) {
      return {
        bytes: 0,
        label: 'Est Generated data',
        tooltip:
          'This test only runs queries against preexisting data and does not generate any new data in Redis.',
      };
    }

    return {
      bytes: null,
      label: 'Est Generated data',
      tooltip:
        'Estimated generated data is undefined for this command workload because payload size per write cannot be inferred safely from the command alone.',
    };
  }

  if (
    config?.dataSize === null ||
    config?.dataSize === undefined ||
    config?.setRatio === null ||
    config?.setRatio === undefined ||
    config?.getRatio === null ||
    config?.getRatio === undefined
  ) {
    return {
      bytes: null,
      label: 'Est Generated data',
      tooltip: 'Estimated generated data is unavailable because one or more workload parameters are missing.',
    };
  }

  const totalRatio = config.setRatio + config.getRatio;
  if (totalRatio <= 0 || config.setRatio <= 0) {
    return {
      bytes: 0,
      label: 'Est Generated data',
      tooltip:
        'This workload has no write operations in its command mix, so it is estimated to generate no new Redis data.',
    };
  }

  const totalClients = (config.clients ?? 0) * (config.threads ?? 0);
  if (totalClients <= 0) {
    return {
      bytes: null,
      label: 'Est Generated data',
      tooltip: 'Estimated generated data is unavailable because total client count is not valid.',
    };
  }

  const writeRatio = config.setRatio / totalRatio;

  if (config.limitMode === 'requests') {
    const writesPerClient = (config.requestCount ?? 0) * writeRatio;
    return {
      bytes: config.dataSize * writesPerClient * totalClients,
      label: 'Est Generated data',
      tooltip: [
        'Final generated data estimate for this request-based write workload.',
        `Formula: data size × writes per client × total clients`,
        `= ${config.dataSize} B × ${writesPerClient.toFixed(0)} × ${totalClients}`,
        `Write ratio: ${config.setRatio}:${config.getRatio}`,
      ].join('\n'),
    };
  }

  const configuredDurationSeconds = Number(config.testTime ?? scenario?.defaults?.testTime ?? NaN);
  const hasConfiguredDuration =
    configuredDurationSeconds !== null &&
    configuredDurationSeconds !== undefined &&
    !Number.isNaN(configuredDurationSeconds);
  const configuredRateLimit = Number(config.rateLimit ?? NaN);
  const estimatedScenarioThroughput = Number(scenario?.estimatedOpsPerSec ?? NaN);
  let estimatedThroughput = null;

  if (config.rateLimitEnabled && !Number.isNaN(configuredRateLimit)) {
    estimatedThroughput = !Number.isNaN(estimatedScenarioThroughput)
      ? Math.min(configuredRateLimit, estimatedScenarioThroughput)
      : configuredRateLimit;
  } else if (!Number.isNaN(estimatedScenarioThroughput)) {
    estimatedThroughput = estimatedScenarioThroughput;
  }

  const staircaseAdjustedThroughput = hasStaircaseProfile(config)
    ? estimateStaircaseThroughput(estimatedThroughput, config)
    : estimatedThroughput;

  const hasEstimatedThroughput =
    staircaseAdjustedThroughput !== null &&
    staircaseAdjustedThroughput !== undefined &&
    !Number.isNaN(staircaseAdjustedThroughput);

  if (hasConfiguredDuration && hasEstimatedThroughput) {
    const bytes = config.dataSize * staircaseAdjustedThroughput * configuredDurationSeconds * writeRatio;
    const averageActiveClients = estimateAverageActiveClientsPerThread(config);
    const throughputSource = config.rateLimitEnabled
      ? !Number.isNaN(estimatedScenarioThroughput)
        ? `min(rate limit ${configuredRateLimit.toFixed(0)} ops/sec, preset estimate ${estimatedScenarioThroughput.toFixed(0)} ops/sec)`
        : `rate limit ${configuredRateLimit.toFixed(0)} ops/sec`
      : `preset estimate ${estimatedThroughput.toFixed(0)} ops/sec`;
    const approximationLine =
      hasStaircaseProfile(config) && averageActiveClients
        ? `Approximation: staircase average ${averageActiveClients.toFixed(1)} of ${config.clients} clients/thread.`
        : null;

    return {
      bytes,
      label: 'Estimated data',
      tooltip: [
        hasStaircaseProfile(config)
          ? 'Approximate generated data estimate for this staircase workload.'
          : 'Final generated data estimate for this time-based write workload.',
        'Formula: data size × estimated ops/sec × duration × write ratio',
        `= ${config.dataSize} B × ${staircaseAdjustedThroughput.toFixed(0)} × ${configuredDurationSeconds.toFixed(1)}s × ${(writeRatio * 100).toFixed(0)}%`,
        `Throughput source: ${throughputSource}`,
        approximationLine,
        `Write ratio: ${config.setRatio}:${config.getRatio}`,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  return {
    bytes: null,
    label: 'Est Generated data',
    tooltip:
      'Estimated generated data is unavailable because this time-based workload has no configured throughput estimate.',
  };
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

function getFinalLatencyValue(preferred, fallback = null) {
  if (
    preferred === 0 &&
    fallback !== null &&
    fallback !== undefined &&
    !Number.isNaN(fallback) &&
    fallback > 0
  ) {
    return fallback;
  }

  return getFinalMetricValue(preferred, fallback);
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

  return getFinalLatencyValue(
    summaryTotals?.p99Latency,
    getFinalMetricValue(rollingP99, run.metrics.latency_p99),
  );
}

function getP999LatencyValue(run) {
  return getFinalLatencyValue(run.summary?.results?.totals?.p999Latency, null);
}

function getMaxLatencyValue(run) {
  const latencySeries = getDisplaySeries(run, 'latency_ms');

  return getFinalLatencyValue(run.summary?.results?.totals?.maxLatency, getSeriesPeak(latencySeries));
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
  const p90Latency = getFinalLatencyValue(
    summaryTotals?.p90Latency,
    getFinalMetricValue(metrics.latency_p90, getSeriesPercentile(latencySeries, 90)),
  );
  const p999Latency = getP999LatencyValue(run);
  const maxLatency = getMaxLatencyValue(run);

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
        getFinalLatencyValue(summaryTotals?.avgLatency, metrics.latency_avg_ms),
        formatLatency,
      ),
    },
    {
      label: 'p50 latency',
      value: formatMetric(
        getFinalLatencyValue(summaryTotals?.p50Latency, metrics.latency_p50),
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
      label: 'p99.9 latency',
      value: formatMetric(p999Latency, formatLatency),
    },
    {
      label: 'Max latency',
      value: formatMetric(maxLatency, formatLatency),
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
  const items = [
    { label: hasStaircaseProfile(config) ? 'Max clients' : 'Clients / thread', value: `${config.clients}` },
    { label: 'Threads per client', value: `${config.threads}` },
    { label: 'Run limit', value: formatRunLimit(config) },
    { label: 'Key prefix', value: config.keyPrefix },
    { label: 'Pipeline', value: `${config.pipeline}` },
    { label: 'Rate limiting', value: formatRateLimitSummary(config) },
  ];

  if (config.command) {
    items.splice(3, 0, { label: 'Command', value: formatCommandMix(config) });
  } else {
    items.splice(
      3,
      0,
      { label: 'Command mix', value: formatWorkloadMix(config) },
      { label: 'Value bytes', value: formatDataSizeSummary(config) },
    );
  }

  return items;
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
      value: getFinalLatencyValue(summaryTotals?.p50Latency, metrics.latency_p50),
      formatter: formatLatency,
    },
    {
      key: 'average',
      label: 'average',
      value: getFinalLatencyValue(summaryTotals?.avgLatency, metrics.latency_avg_ms),
      formatter: formatLatency,
    },
    {
      key: 'p90',
      label: 'p90',
      value: getFinalLatencyValue(
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
    {
      key: 'p99.9',
      label: 'p99.9',
      value: getP999LatencyValue(run),
      formatter: formatLatency,
    },
    {
      key: 'max',
      label: 'max',
      value: getMaxLatencyValue(run),
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
    loadProfile: formatLoadProfileSummary(config),
    threads: config.threads ?? run.summary?.config.threads ?? null,
    runLimit: config.limitMode ? formatRunLimit(config) : null,
    command: config.command ?? null,
    commandMix:
      config.setRatio !== undefined && config.getRatio !== undefined
        ? formatWorkloadMix(config)
        : null,
    dataSize: config.dataSize ?? null,
    keyPrefix: config.keyPrefix ?? null,
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
    averageLatency: getFinalLatencyValue(summaryTotals?.avgLatency, run.metrics.latency_avg_ms),
    p50Latency: getFinalLatencyValue(summaryTotals?.p50Latency, run.metrics.latency_p50),
    p90Latency: getFinalLatencyValue(summaryTotals?.p90Latency, run.metrics.latency_p90),
    p99Latency: getP99LatencyValue(run),
    p999Latency: getP999LatencyValue(run),
    maxLatency: getMaxLatencyValue(run),
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
      label: 'Load profile',
      values: snapshots.map((snapshot) => snapshot.loadProfile ?? '—'),
    },
    {
      label: 'Threads per client',
      values: snapshots.map((snapshot) => formatMetric(snapshot.threads, String)),
    },
    {
      label: 'Run limit',
      values: snapshots.map((snapshot) => snapshot.runLimit ?? '—'),
    },
    {
      label: 'Command',
      values: snapshots.map((snapshot) => snapshot.command ?? '—'),
    },
    {
      label: 'Command mix',
      values: snapshots.map((snapshot) => snapshot.commandMix ?? '—'),
    },
    {
      label: 'Value bytes',
      values: snapshots.map((snapshot) =>
        snapshot.dataSize !== null && snapshot.dataSize !== undefined ? `${snapshot.dataSize} B` : '—',
      ),
    },
    {
      label: 'Key prefix',
      values: snapshots.map((snapshot) => snapshot.keyPrefix ?? '—'),
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
      label: 'p99.9 latency',
      values: snapshots.map((snapshot) => formatMetric(snapshot.p999Latency, formatLatency)),
    },
    {
      label: 'Max latency',
      values: snapshots.map((snapshot) => formatMetric(snapshot.maxLatency, formatLatency)),
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

function getCompareColor(engine, engineIndex, fallbackIndex) {
  const palette = COMPARE_ENGINE_COLORS[engine] ?? null;
  if (palette?.length) {
    return palette[engineIndex % palette.length];
  }

  return COMPARE_FALLBACK_COLORS[fallbackIndex % COMPARE_FALLBACK_COLORS.length];
}

function buildCompareColorMap(comparedRuns) {
  const engineCounts = new Map();

  return comparedRuns.map(({ run }, index) => {
    const { engine } = normalizeDatabaseSource(run?.databaseSource);
    const engineIndex = engineCounts.get(engine) ?? 0;
    engineCounts.set(engine, engineIndex + 1);
    return getCompareColor(engine, engineIndex, index);
  });
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

function DatabaseSourceIcon({ engine }) {
  return engine === 'valkey' ? <ValkeySymbolIcon /> : <RedisStackIcon />;
}

function DatabaseSourceBadge({ className = '', source }) {
  const normalizedSource = normalizeDatabaseSource(source);
  const engineLabel = getDatabaseEngineLabel(normalizedSource.engine);
  const serviceLabel = getDatabaseServiceLabel(normalizedSource.service);

  return (
    <span
      aria-label={`${serviceLabel}, ${engineLabel}`}
      className={`database-source-badge database-source-badge-${normalizedSource.engine} ${className}`.trim()}
      title={`${serviceLabel} / ${engineLabel}`}
    >
      <DatabaseSourceIcon engine={normalizedSource.engine} />
      <span>{`${serviceLabel} / ${engineLabel}`}</span>
    </span>
  );
}

function DatabaseSourceSelects({ className = '', compact = false, formState, onFormChange }) {
  const engineSelect = (
    <select
      aria-label={compact ? 'Engine' : undefined}
      className={`database-source-select ${formState.engine ? '' : 'is-placeholder'}`.trim()}
      name="engine"
      onChange={onFormChange}
      value={formState.engine ?? ''}
    >
      <option disabled value="">
        Select Engine
      </option>
      {DATABASE_ENGINE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  const serviceSelect = (
    <select
      aria-label={compact ? 'Service' : undefined}
      className={`database-source-select ${formState.service ? '' : 'is-placeholder'}`.trim()}
      name="service"
      onChange={onFormChange}
      value={formState.service ?? ''}
    >
      <option disabled value="">
        Select Provider
      </option>
      {DATABASE_SERVICE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  if (compact) {
    return (
      <div className={`database-source-select-row database-source-select-row-compact ${className}`.trim()}>
        {engineSelect}
        {serviceSelect}
      </div>
    );
  }

  return (
    <div className={`form-row database-source-select-row ${className}`.trim()}>
      <label>
        <span>Engine</span>
        {engineSelect}
      </label>
      <label>
        <span>Service</span>
        {serviceSelect}
      </label>
    </div>
  );
}

function ConnectionScreen({
  formState,
  onFormChange,
  onHostOrUrlPaste,
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
              onPaste={onHostOrUrlPaste}
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

          <DatabaseSourceSelects formState={formState} onFormChange={onFormChange} />

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
  formError,
  onConnect,
  onClose,
  onFormChange,
  onHostOrUrlPaste,
}) {
  return (
    <div className="topbar-connect-form-shell">
      <form className="topbar-connect-form" onSubmit={onConnect}>
        <div className="topbar-host-source-group">
          <input
            autoComplete="off"
            name="hostOrUrl"
            onChange={onFormChange}
            onPaste={onHostOrUrlPaste}
            placeholder="Host or URL"
            value={formState.hostOrUrl}
          />
          <DatabaseSourceSelects
            className="topbar-source-selects"
            compact
            formState={formState}
            onFormChange={onFormChange}
          />
        </div>
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
        <div className="topbar-connect-actions">
          <button className="primary-button" disabled={connectDisabled} type="submit">
            {connectPending ? 'Connecting…' : 'Connect'}
          </button>
          {onClose ? (
            <button className="ghost-button topbar-close-form-button" onClick={onClose} type="button">
              Close
            </button>
          ) : null}
        </div>
        {formError ? <p className="form-error topbar-form-error">{formError}</p> : null}
      </form>
    </div>
  );
}

function ConnectionModal({
  connectDisabled,
  connectPending,
  formError,
  formState,
  onClose,
  onConnect,
  onFormChange,
  onHostOrUrlPaste,
  open,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-scrim connection-modal-scrim" onClick={onClose}>
      <section
        aria-labelledby="connection-modal-title"
        aria-modal="true"
        className="connection-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="connection-modal-header">
          <div>
            <p className="eyebrow">Database</p>
            <h2 id="connection-modal-title">Add connection</h2>
          </div>
        </div>
        <ConnectionFormPanel
          connectDisabled={connectDisabled}
          connectPending={connectPending}
          formError={formError}
          formState={formState}
          onClose={onClose}
          onConnect={onConnect}
          onFormChange={onFormChange}
          onHostOrUrlPaste={onHostOrUrlPaste}
        />
      </section>
    </div>
  );
}

function DatasetLoadModal({
  allConnections,
  datasetPresets,
  initialAllConnections = false,
  initialPresetId = null,
  notice = '',
  onClose,
  onLoad,
  open,
  primaryConnection,
}) {
  const [flushEnabled, setFlushEnabled] = useState(true);
  const [loadAllConnections, setLoadAllConnections] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(() =>
    findDatasetPreset(datasetPresets, initialPresetId).id,
  );
  const [isCustom, setIsCustom] = useState(false);
  const [customBasePresetId, setCustomBasePresetId] = useState(null);
  const [configPaneOpen, setConfigPaneOpen] = useState(false);
  const [datasetYamlText, setDatasetYamlText] = useState(() =>
    findDatasetPreset(datasetPresets, initialPresetId).datasetYaml,
  );
  const [storageYamlText, setStorageYamlText] = useState(() =>
    findDatasetPreset(datasetPresets, initialPresetId).storageYaml,
  );
  const [datasetYamlError, setDatasetYamlError] = useState('');
  const [storageYamlError, setStorageYamlError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);
  const initializationKeyRef = useRef('');

  useEffect(() => {
    if (!open) {
      initializationKeyRef.current = '';
      return;
    }

    const initializationKey = JSON.stringify({
      connectionId: primaryConnection?.id ?? '',
      initialAllConnections: Boolean(initialAllConnections),
      initialPresetId: initialPresetId ?? '',
    });

    if (initializationKeyRef.current === initializationKey) {
      return;
    }

    initializationKeyRef.current = initializationKey;

    const firstPreset = findDatasetPreset(datasetPresets, initialPresetId);
    setFlushEnabled(true);
    setLoadAllConnections(Boolean(initialAllConnections) && allConnections.length > 1);
    setSelectedPresetId(firstPreset.id);
    setIsCustom(firstPreset.id === 'custom');
    setCustomBasePresetId(null);
    setConfigPaneOpen(false);
    setDatasetYamlText(firstPreset.datasetYaml);
    setStorageYamlText(firstPreset.storageYaml);
    setDatasetYamlError('');
    setStorageYamlError('');
    setSubmitError('');
    setLoading(false);
  }, [allConnections.length, datasetPresets, initialAllConnections, initialPresetId, open, primaryConnection?.id]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, onClose, open]);

  if (!open || !primaryConnection) {
    return null;
  }

  const showAllConnectionsToggle = allConnections.length > 1;
  const targetConnections = loadAllConnections ? allConnections : [primaryConnection];
  const presetOptions = getDatasetPresetOptions(datasetPresets);
  const selectedPreset = findDatasetPreset(datasetPresets, selectedPresetId);
  const actionLabel = flushEnabled ? 'Flush and Load' : 'Load';
  const readOnly = !isCustom;
  const canCustomize = !isCustom && selectedPresetId !== 'custom';
  const canResetToDefaults = isCustom && Boolean(customBasePresetId);
  const summaryRecordCount =
    selectedPresetId === 'custom' ? formatRecordCount(null) : formatRecordCount(selectedPreset.recordCount);
  const summaryTotalSize = selectedPresetId === 'custom' ? 'Custom size' : selectedPreset.totalSize;
  const subtitle = formatConnectionNames(targetConnections);

  function handlePresetSelect(nextPresetId) {
    const nextPreset = findDatasetPreset(datasetPresets, nextPresetId);

    if (nextPresetId === 'custom') {
      setCustomBasePresetId((currentBasePresetId) =>
        selectedPresetId !== 'custom' ? selectedPresetId : currentBasePresetId,
      );
      setSelectedPresetId('custom');
      setIsCustom(true);
      if (!datasetYamlText.trim() && !storageYamlText.trim()) {
        setDatasetYamlText(BLANK_DATASET_YAML);
        setStorageYamlText(BLANK_STORAGE_YAML);
      }
      return;
    }

    setSelectedPresetId(nextPresetId);
    setIsCustom(false);
    setCustomBasePresetId(null);
    setDatasetYamlText(nextPreset.datasetYaml);
    setStorageYamlText(nextPreset.storageYaml);
    setDatasetYamlError('');
    setStorageYamlError('');
    setSubmitError('');
  }

  function handleCustomize() {
    setCustomBasePresetId(selectedPresetId !== 'custom' ? selectedPresetId : customBasePresetId);
    setSelectedPresetId('custom');
    setIsCustom(true);
    setConfigPaneOpen(true);
  }

  function handleResetToDefaults() {
    if (!customBasePresetId) {
      return;
    }

    const basePreset = findDatasetPreset(datasetPresets, customBasePresetId);
    setSelectedPresetId(basePreset.id);
    setIsCustom(false);
    setCustomBasePresetId(null);
    setDatasetYamlText(basePreset.datasetYaml);
    setStorageYamlText(basePreset.storageYaml);
    setDatasetYamlError('');
    setStorageYamlError('');
    setSubmitError('');
  }

  async function handleSubmit() {
    const nextDatasetError = parseYamlError(datasetYamlText, 'Dataset spec');
    const nextStorageError = parseYamlError(storageYamlText, 'Storage spec');

    setDatasetYamlError(nextDatasetError);
    setStorageYamlError(nextStorageError);
    setSubmitError('');

    if (nextDatasetError || nextStorageError) {
      setConfigPaneOpen(true);
      return;
    }

    setLoading(true);

    try {
      await onLoad({
        connectionIds: targetConnections.map((connection) => connection.id),
        datasetYaml: datasetYamlText,
        datasetPresetName: selectedPresetId === 'custom' ? 'Custom dataset' : selectedPreset.name,
        flushEnabled,
        storageYaml: storageYamlText,
      });
      onClose();
    } catch (error) {
      setSubmitError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={() => !loading && onClose()}>
      <section
        aria-modal="true"
        className={`dataset-modal ${configPaneOpen ? 'has-config-pane' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="dataset-modal-header">
          <div>
            <p className="eyebrow">Load dataset</p>
            <h2>{primaryConnection.name}</h2>
            <p className="dataset-modal-subtitle">{subtitle}</p>
          </div>
        </header>

        <div className="dataset-modal-body">
          <div className="dataset-modal-main">
            <label className="dataset-check">
              <input
                checked={flushEnabled}
                disabled={loading}
                onChange={(event) => setFlushEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>Flush database before loading</span>
            </label>

            {showAllConnectionsToggle ? (
              <label className="dataset-check">
                <input
                  checked={loadAllConnections}
                  disabled={loading}
                  onChange={(event) => setLoadAllConnections(event.target.checked)}
                  type="checkbox"
                />
                <span>All live connections</span>
              </label>
            ) : null}

            <div className="dataset-field">
              <span className="dataset-field-label">Dataset preset</span>
              <select
                className="dataset-preset-select"
                disabled={loading}
                onChange={(event) => handlePresetSelect(event.target.value)}
                value={selectedPresetId}
              >
                {presetOptions.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="dataset-summary-card">
              <div>
                <p className="dataset-summary-line">{summaryRecordCount}</p>
                <p className="dataset-summary-line">{summaryTotalSize}</p>
                {notice ? <p className="dataset-summary-note">{notice}</p> : null}
              </div>

              <div className="dataset-summary-actions">
                <button
                  className={`ghost-button ${configPaneOpen ? 'is-active' : ''}`}
                  disabled={loading}
                  onClick={() => setConfigPaneOpen((current) => !current)}
                  type="button"
                >
                  {configPaneOpen ? 'Hide config' : 'Show config'}
                </button>
              </div>
            </div>

            {submitError ? <p className="dataset-submit-error">{submitError}</p> : null}
          </div>

          {configPaneOpen ? (
            <aside className="dataset-config-pane">
              <div className="dataset-config-pane-head">
                <p className="eyebrow">Config</p>
                {canResetToDefaults ? (
                  <button
                    className="ghost-button"
                    disabled={loading}
                    onClick={handleResetToDefaults}
                    type="button"
                  >
                    Reset to defaults
                  </button>
                ) : null}
                {canCustomize ? (
                  <button className="ghost-button" disabled={loading} onClick={handleCustomize} type="button">
                    Customize
                  </button>
                ) : null}
              </div>

              <label className="dataset-editor-field">
                <span>Dataset spec</span>
                <textarea
                  className={datasetYamlError ? 'is-invalid' : ''}
                  onChange={(event) => {
                    setDatasetYamlText(event.target.value);
                    setDatasetYamlError('');
                  }}
                  readOnly={readOnly}
                  spellCheck={false}
                  value={datasetYamlText}
                />
                {datasetYamlError ? <strong className="dataset-editor-error">{datasetYamlError}</strong> : null}
              </label>

              <label className="dataset-editor-field">
                <span>Storage spec</span>
                <textarea
                  className={storageYamlError ? 'is-invalid' : ''}
                  onChange={(event) => {
                    setStorageYamlText(event.target.value);
                    setStorageYamlError('');
                  }}
                  readOnly={readOnly}
                  spellCheck={false}
                  value={storageYamlText}
                />
                {storageYamlError ? <strong className="dataset-editor-error">{storageYamlError}</strong> : null}
              </label>
            </aside>
          ) : null}
        </div>

        <footer className="dataset-modal-footer">
          <button className="ghost-button" disabled={loading} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button" disabled={loading} onClick={handleSubmit} type="button">
            {loading ? 'Loading…' : actionLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

function PresetLoadResultModal({ message, onClose, open, title, tone = 'success' }) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <section
        aria-modal="true"
        className={`missing-index-modal preset-result-modal preset-result-modal-${tone}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="missing-index-copy">
          <p className="eyebrow">Preset loader</p>
          <h2>{title}</h2>
          <p>{message}</p>
        </div>

        <footer className="missing-index-actions">
          <button className="primary-button" onClick={onClose} type="button">
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}

function MissingIndexModal({
  connectionNames,
  datasetName,
  indexNames,
  onCancel,
  onLoadDataset,
  open,
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  const indexLabel = indexNames.join(', ');
  const connectionLabel = connectionNames.join(', ');

  return (
    <div className="modal-scrim" onClick={onCancel}>
      <section
        aria-modal="true"
        className="missing-index-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="missing-index-copy">
          <p className="eyebrow">Missing index</p>
          <h2>Needs data loaded first.</h2>
          <p>
            {`This requires index ${indexLabel}, which is not found on ${connectionLabel}.\nPlease load the ${datasetName} dataset.`}
          </p>
        </div>

        <footer className="missing-index-actions">
          <button className="ghost-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="primary-button" onClick={onLoadDataset} type="button">
            Load dataset
          </button>
        </footer>
      </section>
    </div>
  );
}

function CancelRunModal({ onCancel, onConfirm, open, pending }) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !pending) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel, open, pending]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-scrim" onClick={pending ? undefined : onCancel}>
      <section
        aria-modal="true"
        className="missing-index-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="missing-index-copy">
          <p className="eyebrow">Cancel benchmark</p>
          <h2>Are you sure you want to cancel?</h2>
          <p>This will stop the active Memtier run and restore the test setup to its pre-run state.</p>
        </div>

        <footer className="missing-index-actions">
          <button className="ghost-button" disabled={pending} onClick={onCancel} type="button">
            No
          </button>
          <button className="primary-button" disabled={pending} onClick={onConfirm} type="button">
            {pending ? 'Canceling…' : 'Yes'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function GeneratedDataMetric({
  className = '',
  run,
  scenario,
  config,
  variant = 'generated',
}) {
  const details =
    variant === 'estimated'
      ? getEstimatedGeneratedDatasetDetails(scenario, config)
      : getGeneratedDatasetDetails(run, scenario, config);
  const isZero = details.bytes === 0;
  const labelPrefix =
    details.label ?? (variant === 'estimated' ? 'Est Generated data' : 'Generated data');
  const label =
    variant === 'estimated'
      ? `${labelPrefix}: ${details.bytes === null ? '—' : formatDataVolume(details.bytes)}`
      : isZero
        ? 'No generated data'
        : `${labelPrefix}: ${formatDataVolume(details.bytes)}`;
  const valueLabel = details.bytes === null ? '—' : formatDataVolume(details.bytes);

  if (!details.tooltip) {
    return <span className={`generated-data-metric ${className}`.trim()}>{label}</span>;
  }

  if (variant === 'estimated') {
    return (
      <span className={`generated-data-metric ${className}`.trim()}>
        <span className="generated-data-prefix">{labelPrefix}: </span>
        <span className="generated-data-anchor" tabIndex={0}>
          <span className="generated-data-label">{valueLabel}</span>
          <span className="generated-data-tooltip">{details.tooltip}</span>
        </span>
      </span>
    );
  }

  return (
    <span className={`generated-data-metric ${className}`.trim()}>
      <span className="generated-data-anchor" tabIndex={0}>
        <span className="generated-data-label">{label}</span>
        <span className="generated-data-tooltip">{details.tooltip}</span>
      </span>
    </span>
  );
}

function CurrentClientsMetric({ className = '', run }) {
  const currentClients =
    run?.metrics?.connections ??
    getSeriesValueAtEnd(run?.series?.connections ?? []);
  const currentClientsLabel =
    currentClients === null || currentClients === undefined || Number.isNaN(currentClients)
      ? '—'
      : formatConnections(currentClients);

  return (
    <span className={`generated-data-metric ${className}`.trim()}>
      <span className="generated-data-label">{`Current clients: ${currentClientsLabel}`}</span>
    </span>
  );
}

function ConnectionCard({
  connection,
  disconnectDisabled,
  isSelected,
  loadDisabled,
  redisInsightActionTitle,
  redisInsightDisabled,
  onLoadDataset,
  onDisconnect,
  onOpenRedisInsight,
  onRename,
  onSelect,
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(connection.name);
  const [showMenu, setShowMenu] = useState(false);
  const titleEditorRef = useRef(null);
  const menuRef = useRef(null);

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

  useEffect(() => {
    if (!showMenu) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) {
        return;
      }

      setShowMenu(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [showMenu]);

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
          disabled={disconnectDisabled}
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

      {connection.load?.status === 'running' ? (
        <div className="connection-load-block">
          <div className="connection-load-head">
            <span>Dataset load</span>
            <strong>{formatProgress(connection.load.progressPct ?? 0)}</strong>
          </div>
          <div className="progress-track progress-track-light">
            <span
              className="progress-fill"
              style={{ width: `${Math.max(0, Math.min(100, connection.load.progressPct ?? 0))}%` }}
            />
          </div>
        </div>
      ) : null}

      {connection.load?.status === 'failed' ? (
        <p className="connection-load-error">{connection.load.error ?? 'Dataset load failed'}</p>
      ) : null}

      <DatabaseSourceBadge
        className="connection-source-badge"
        source={connection.databaseSource}
      />

      <div
        className={`connection-menu-wrap ${showMenu ? 'is-open' : ''}`}
        onClick={(event) => event.stopPropagation()}
        ref={menuRef}
      >
        <button
          className="connection-menu-toggle"
          onClick={() => setShowMenu((open) => !open)}
          title="Connection actions"
          type="button"
        >
          <MoreIcon />
        </button>

        {showMenu ? (
          <div className="connection-menu">
            <button
              className="connection-menu-item"
              disabled={loadDisabled}
              onClick={() => {
                setShowMenu(false);
                onLoadDataset(connection);
              }}
              type="button"
            >
              Load dataset
            </button>
            <button
              className="connection-menu-item"
              disabled={redisInsightDisabled}
              onClick={() => {
                setShowMenu(false);
                onOpenRedisInsight(connection.id);
              }}
              title={redisInsightActionTitle}
              type="button"
            >
              View in Redis Insight
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PresetInfoTooltip() {
  return (
    <span className="topbar-preset-info-anchor" tabIndex={0}>
      <span aria-hidden="true" className="topbar-preset-info-badge">
        i
      </span>
      <span className="topbar-preset-tooltip">
        <span>
          A preset bundles the built-in tests and dataset presets for one workflow.
        </span>
        <a
          href="https://github.com/itay-ct/Memviz?tab=readme-ov-file#presets"
          rel="noreferrer"
          target="_blank"
        >
          See the README
        </a>
      </span>
    </span>
  );
}

function TopBar({
  connectDisabled,
  connectError,
  connectPending,
  connections,
  formState,
  hasActiveLoads,
  hasRunningRuns,
  onConnect,
  onConnectionFormVisibilityChange,
  onDisconnect,
  onFormChange,
  onHostOrUrlPaste,
  onLoadDataset,
  onPrepareAddConnection,
  onPresetChange,
  onOpenRedisInsight,
  onRenameConnection,
  onSelectConnection,
  presetOptions,
  presetSelectionDisabled,
  redisInsightActionTitle,
  redisInsightDisabled,
  selectedConnectionId,
  selectedPresetName,
  setup,
  validationError,
}) {
  const [showAddConnectionForm, setShowAddConnectionForm] = useState(false);
  const setupReady = setup.status === 'ready';
  const setupNote =
    setup.status === 'error' ? 'Setup needs attention' : !setupReady ? 'Preparing memtier' : null;
  const canAddConnection =
    setupReady && connections.length < 4 && !hasRunningRuns && !hasActiveLoads;
  const showInlineForm = !connections.length;
  const showAddConnectionModal = connections.length > 0 && showAddConnectionForm;
  const formVisible = showInlineForm || showAddConnectionModal;
  const activePresetName = selectedPresetName || presetOptions[0]?.name || '';

  useEffect(() => {
    if (!connections.length) {
      setShowAddConnectionForm(false);
      return;
    }

    setShowAddConnectionForm(false);
  }, [connections.length]);

  useEffect(() => {
    onConnectionFormVisibilityChange?.(formVisible);
  }, [formVisible, onConnectionFormVisibilityChange]);

  return (
    <>
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
            {presetOptions.length ? (
              <label className="topbar-preset-picker" htmlFor="topbar-preset-select">
                <span className="topbar-preset-label">Preset</span>
                <select
                  id="topbar-preset-select"
                  className="topbar-preset-select"
                  disabled={presetSelectionDisabled}
                  onChange={(event) => onPresetChange(event.target.value)}
                  value={activePresetName}
                >
                  {presetOptions.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.label}
                    </option>
                  ))}
                  <option value={UPLOAD_PRESET_OPTION}>Load preset file…</option>
                </select>
                <PresetInfoTooltip />
              </label>
            ) : null}
          </div>
        </div>

        <div className="topbar-connections">
          {connections.map((connection) => (
            <ConnectionCard
              connection={connection}
              disconnectDisabled={hasRunningRuns || hasActiveLoads}
              isSelected={connection.id === selectedConnectionId}
              key={connection.id}
              loadDisabled={hasRunningRuns || hasActiveLoads}
              redisInsightActionTitle={redisInsightActionTitle}
              redisInsightDisabled={redisInsightDisabled}
              onLoadDataset={onLoadDataset}
              onDisconnect={onDisconnect}
              onOpenRedisInsight={onOpenRedisInsight}
              onRename={onRenameConnection}
              onSelect={onSelectConnection}
            />
          ))}

          {showInlineForm ? (
            <ConnectionFormPanel
              connectDisabled={connectDisabled}
              connectPending={connectPending}
              formError={connectError || validationError}
              formState={formState}
              onConnect={onConnect}
              onFormChange={onFormChange}
              onHostOrUrlPaste={onHostOrUrlPaste}
            />
          ) : null}
        </div>

        {connections.length ? (
          <div className="topbar-trailing">
            <button
              className="ghost-button"
              disabled={!canAddConnection}
              onClick={() => {
                onPrepareAddConnection();
                setShowAddConnectionForm(true);
              }}
              type="button"
            >
              Add connection
            </button>
          </div>
        ) : null}
      </header>

      <ConnectionModal
        connectDisabled={connectDisabled}
        connectPending={connectPending}
        formError={connectError || validationError}
        formState={formState}
        onClose={() => setShowAddConnectionForm(false)}
        onConnect={onConnect}
        onFormChange={onFormChange}
        onHostOrUrlPaste={onHostOrUrlPaste}
        open={showAddConnectionModal}
      />
    </>
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

function getDurationUnit(value) {
  return Number(value) >= 120 ? 'min' : 'sec';
}

function formatDurationInputValue(value, unit) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '';
  }

  if (unit === 'min') {
    return String(Math.max(2, Math.round(numericValue / 60)));
  }

  return String(numericValue);
}

function DurationCellControl({ disabled, limits, onChange, value }) {
  const [unit, setUnit] = useState(() => getDurationUnit(value));
  const [draftValue, setDraftValue] = useState(() => formatDurationInputValue(value, unit));

  useEffect(() => {
    if (Number(value) < 120 && unit === 'min') {
      setUnit('sec');
      return;
    }

    setDraftValue(formatDurationInputValue(value, unit));
  }, [unit, value]);

  function commit(nextRawValue) {
    const parsed = Number(nextRawValue);
    let normalizedValue;

    if (unit === 'min') {
      const nextMinutes = Number.isFinite(parsed) ? parsed : Math.round(value / 60);
      normalizedValue = Math.round(Math.max(2, nextMinutes)) * 60;
    } else {
      const nextSeconds = Number.isFinite(parsed) ? parsed : value;
      normalizedValue =
        nextSeconds > 120
          ? Math.round(Math.max(2, nextSeconds / 60)) * 60
          : nextSeconds;
    }

    const nextValue = clampValue(normalizedValue, limits);
    const nextUnit = nextValue >= 120 ? unit : 'sec';
    setUnit(nextUnit);
    setDraftValue(formatDurationInputValue(nextValue, nextUnit));
    onChange(nextValue);
  }

  function handleUnitToggle() {
    if (disabled) {
      return;
    }

    if (unit === 'sec') {
      const nextValue = value < 120 ? 120 : Math.round(value / 60) * 60;
      setUnit('min');
      onChange(clampValue(nextValue, limits));
      return;
    }

    setUnit('sec');
    onChange(clampValue(value < 120 ? 120 : value, limits));
  }

  return (
    <div className="table-number-control table-number-control-with-suffix">
      <input
        disabled={disabled}
        inputMode="numeric"
        max={unit === 'min' ? limits.max / 60 : 120}
        min={unit === 'min' ? limits.min / 60 : limits.min}
        onBlur={() => commit(draftValue)}
        onChange={(event) => setDraftValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(draftValue);
          }

          if (event.key === 'Escape') {
            setDraftValue(formatDurationInputValue(value, unit));
          }
        }}
        step={unit === 'min' ? 1 : Math.max(1, limits.step)}
        type="number"
        value={draftValue}
      />
      <button
        className="table-number-suffix table-number-suffix-button"
        disabled={disabled}
        onClick={handleUnitToggle}
        type="button"
      >
        {unit}
      </button>
    </div>
  );
}

function TextCellControl({
  disabled,
  multiline = false,
  onChange,
  placeholder = '',
  value,
}) {
  if (multiline) {
    return (
      <div className="table-text-control table-text-control-multiline">
        <textarea
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          spellCheck={false}
          value={value}
        />
      </div>
    );
  }

  return (
    <div className="table-text-control">
      <input
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        type="text"
        value={value}
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

function StaircaseConfigRow({ children, groupEnd = false, label }) {
  return (
    <tr className={`config-table-row config-table-row-grouped ${groupEnd ? 'config-table-row-group-end' : ''}`.trim()}>
      <th>{label}</th>
      <td>{children}</td>
    </tr>
  );
}

function formatDurationLabel(seconds) {
  const numericSeconds = Number(seconds);
  if (!Number.isFinite(numericSeconds) || numericSeconds <= 0) {
    return '0s';
  }

  const minutes = Math.floor(numericSeconds / 60);
  const remainder = numericSeconds % 60;

  if (!minutes) {
    return `${numericSeconds}s`;
  }

  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function buildStaircaseRampWarning(config) {
  if (!hasStaircaseProfile(config)) {
    return null;
  }

  const minimumDurationSeconds = getMinimumRampDurationSeconds(config);
  const configuredDurationSeconds = Number(config?.testTime ?? NaN);
  if (
    !minimumDurationSeconds ||
    !Number.isFinite(configuredDurationSeconds) ||
    configuredDurationSeconds >= minimumDurationSeconds
  ) {
    return null;
  }

  const reachedClients = getReachedClientsPerThreadAtTime(config, configuredDurationSeconds);
  return {
    message: [
      `This staircase needs at least ${formatDurationLabel(minimumDurationSeconds)} to reach the full ${config.clients} clients/thread target.`,
      reachedClients
        ? `With the current ${formatDurationLabel(configuredDurationSeconds)} limit it ramps to about ${reachedClients} clients/thread before the run ends.`
        : null,
    ]
      .filter(Boolean)
      .join(' '),
  };
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
  const isCommandScenario = scenario.kind === 'command';
  const staircaseEnabled = config.staircaseEnabled && !isRequests;
  const staircaseToggleDisabled = disabled || isRequests || config.clients <= 1;
  const staircaseWarning = staircaseEnabled ? buildStaircaseRampWarning(config) : null;
  const clientLabel = staircaseEnabled ? 'Max clients' : 'Clients / thread';
  const threadLabel = 'Threads per client';

  return (
    <div className="config-table-shell" onClick={(event) => event.stopPropagation()}>
      <table className="config-table-ui">
        <tbody>
          <ConfigRow label="Run limit">
            <div className="config-composite-control config-composite-control-stacked">
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
              {isRequests ? (
                <NumericCellControl
                  disabled={disabled}
                  limits={runLimitLimits}
                  onChange={(nextValue) => onConfigChange(runLimitField, nextValue)}
                  value={config[runLimitField]}
                />
              ) : (
                <DurationCellControl
                  disabled={disabled}
                  limits={runLimitLimits}
                  onChange={(nextValue) => onConfigChange(runLimitField, nextValue)}
                  value={config[runLimitField]}
                />
              )}
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

          <ConfigRow label="Cluster">
            <div className="config-composite-control config-composite-control-paired">
              <label className="config-checkbox config-checkbox-wide">
                <input
                  checked={Boolean(config.clusterModeEnabled)}
                  disabled={disabled}
                  onChange={(event) => onConfigChange('clusterModeEnabled', event.target.checked)}
                  type="checkbox"
                />
                <span>Cluster Aware</span>
              </label>
            </div>
          </ConfigRow>

          <StaircaseConfigRow label="">
            <div className="config-composite-control config-composite-control-paired">
              <label className="config-checkbox config-checkbox-wide">
                <input
                  checked={staircaseEnabled}
                  disabled={staircaseToggleDisabled}
                  onChange={(event) => onConfigChange('staircaseEnabled', event.target.checked)}
                  type="checkbox"
                />
                <span>Staircase</span>
                {staircaseWarning ? (
                  <span className="run-warning-anchor" tabIndex={0}>
                    <WarningIcon />
                    <span className="run-warning-tooltip">{staircaseWarning.message}</span>
                  </span>
                ) : null}
              </label>
            </div>
          </StaircaseConfigRow>

          <StaircaseConfigRow groupEnd={!staircaseEnabled} label={clientLabel}>
            <NumericCellControl
              disabled={disabled}
              limits={scenario.limits.clients}
              onChange={(nextValue) => onConfigChange('clients', nextValue)}
              value={config.clients}
            />
          </StaircaseConfigRow>

          {staircaseEnabled ? (
            <>
              <StaircaseConfigRow label="Start clients">
                <NumericCellControl
                  disabled={disabled}
                  limits={scenario.limits.clientsStart}
                  onChange={(nextValue) => onConfigChange('clientsStart', nextValue)}
                  value={config.clientsStart}
                />
              </StaircaseConfigRow>

              <StaircaseConfigRow label="Clients added / step">
                <NumericCellControl
                  disabled={disabled}
                  limits={scenario.limits.clientsStep}
                  onChange={(nextValue) => onConfigChange('clientsStep', nextValue)}
                  value={config.clientsStep}
                />
              </StaircaseConfigRow>

              <StaircaseConfigRow groupEnd label="Step duration">
                <NumericCellControl
                  disabled={disabled}
                  limits={scenario.limits.stepDuration}
                  onChange={(nextValue) => onConfigChange('stepDuration', nextValue)}
                  value={config.stepDuration}
                />
              </StaircaseConfigRow>
            </>
          ) : null}

          <ConfigRow label={threadLabel}>
            <NumericCellControl
              disabled={disabled}
              limits={scenario.limits.threads}
              onChange={(nextValue) => onConfigChange('threads', nextValue)}
              value={config.threads}
            />
          </ConfigRow>

          {!isCommandScenario ? (
            <>
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
            </>
          ) : null}

          <ConfigRow label="Key prefix">
            <TextCellControl
              disabled={disabled}
              onChange={(nextValue) => onConfigChange('keyPrefix', nextValue)}
              placeholder="memtier-"
              value={config.keyPrefix}
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

          {isCommandScenario ? (
            <ConfigRow label="Command">
              <TextCellControl
                disabled={disabled}
                multiline
                onChange={(nextValue) => onConfigChange('command', nextValue)}
                placeholder={'FT.SEARCH idx:users "@balance:[9500 +inf]" SORTBY balance DESC LIMIT 0 5000'}
                value={config.command}
              />
            </ConfigRow>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function getMemtierAdvancedEntry(config, option) {
  const entry = config?.memtierAdvanced?.[option.key];
  if (entry) {
    return entry;
  }

  return {
    enabled: false,
    value: option.defaultValue ?? '',
  };
}

function buildNextMemtierAdvanced(config, option, nextEntry) {
  const nextAdvanced = { ...(config.memtierAdvanced ?? {}) };

  if (!nextEntry.enabled) {
    delete nextAdvanced[option.key];
    return nextAdvanced;
  }

  nextAdvanced[option.key] =
    option.type === 'boolean'
      ? { enabled: true }
      : {
          enabled: true,
          value: nextEntry.value ?? option.defaultValue ?? '',
        };

  return nextAdvanced;
}

function AdvancedMemtierOptionControl({
  config,
  disabled,
  onAdvancedChange,
  option,
}) {
  const entry = getMemtierAdvancedEntry(config, option);
  const enabled = Boolean(entry.enabled);
  const value = entry.value ?? option.defaultValue ?? '';

  function commit(nextEntry) {
    onAdvancedChange(buildNextMemtierAdvanced(config, option, nextEntry));
  }

  if (option.type === 'boolean') {
    return (
      <label className={`advanced-option advanced-option-boolean ${enabled ? 'is-enabled' : ''}`}>
        <input
          checked={enabled}
          disabled={disabled}
          onChange={(event) => commit({ enabled: event.target.checked })}
          type="checkbox"
        />
        <span>{option.label}</span>
        <code>{option.flag}</code>
      </label>
    );
  }

  const inputDisabled = disabled || !enabled;

  return (
    <div className={`advanced-option ${enabled ? 'is-enabled' : ''}`.trim()}>
      <label className="advanced-option-toggle">
        <input
          checked={enabled}
          disabled={disabled}
          onChange={(event) =>
            commit({
              enabled: event.target.checked,
              value,
            })
          }
          type="checkbox"
        />
        <span>{option.label}</span>
        <code>{option.flag}</code>
      </label>

      {option.type === 'select' ? (
        <select
          disabled={inputDisabled}
          onChange={(event) =>
            commit({
              enabled: true,
              value: event.target.value,
            })
          }
          value={value}
        >
          {option.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      ) : option.type === 'multiline' ? (
        <textarea
          disabled={inputDisabled}
          onChange={(event) =>
            commit({
              enabled: true,
              value: event.target.value,
            })
          }
          placeholder={option.placeholder ?? ''}
          rows={3}
          spellCheck={false}
          value={value}
        />
      ) : (
        <input
          disabled={inputDisabled}
          inputMode={option.type === 'text' ? undefined : 'numeric'}
          min={option.min}
          max={option.max}
          onChange={(event) =>
            commit({
              enabled: true,
              value: event.target.value,
            })
          }
          placeholder={option.placeholder ?? option.defaultValue ?? ''}
          step={option.type === 'integer' ? 1 : 'any'}
          type={option.type === 'text' ? 'text' : 'number'}
          value={value}
        />
      )}
    </div>
  );
}

function MemtierAdvancedModal({
  config,
  disabled,
  onClose,
  onConfigChange,
  open,
  scenario,
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <section
        aria-labelledby="memtier-advanced-title"
        aria-modal="true"
        className="memtier-advanced-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="memtier-advanced-header">
          <div>
            <p className="eyebrow">Memtier</p>
            <h2 id="memtier-advanced-title">Advanced parameters</h2>
            <p className="dataset-modal-subtitle">
              Core controls stay synchronized with the test card. Extra flags are appended to
              the generated memtier command and checked against the active runtime before launch.
            </p>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </header>

        <div className="memtier-advanced-body">
          <section className="advanced-option-group advanced-option-group-core">
            <div className="advanced-option-group-head">
              <h3>Core benchmark</h3>
              <span>Always active</span>
            </div>
            <ConfigTable
              config={config}
              disabled={disabled}
              onConfigChange={onConfigChange}
              scenario={scenario}
            />
          </section>

          {MEMTIER_ADVANCED_OPTION_GROUPS.map((group) => (
            <section className="advanced-option-group" key={group.id}>
              <div className="advanced-option-group-head">
                <h3>{group.title}</h3>
                <span>{group.options.length} options</span>
              </div>
              <div className="advanced-option-grid">
                {group.options.map((option) => (
                  <AdvancedMemtierOptionControl
                    config={config}
                    disabled={disabled}
                    key={option.key}
                    onAdvancedChange={(nextAdvanced) =>
                      onConfigChange('memtierAdvanced', nextAdvanced)
                    }
                    option={option}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
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
  databaseSource,
  disabled,
  draft,
  isLaunching,
  isLocked,
  isRunning,
  isSelected,
  isCustomizing,
  onRename,
  onCancelRun,
  onDelete,
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
  const [showMemtierAdvanced, setShowMemtierAdvanced] = useState(false);
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
      setShowMemtierAdvanced(false);
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
          <div className="scenario-subtitle-line">
            <span>{describeDraftSummary(config, run)}</span>
            <span className="scenario-subtitle-separator">•</span>
            <GeneratedDataMetric
              className="scenario-generated-data"
              config={config}
              run={run}
              scenario={scenario}
              variant="estimated"
            />
            {run?.status === 'running' && hasStaircaseProfile(config) ? (
              <>
                <span className="scenario-subtitle-separator">•</span>
                <CurrentClientsMetric className="scenario-generated-data" run={run} />
              </>
            ) : null}
          </div>
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
          ) : (
            <>
              {!isRunning ? (
                <button
                  aria-label={`Delete ${title}`}
                  className="delete-test-button"
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(draft.id);
                  }}
                  title="Delete test"
                  type="button"
                >
                  <TrashIcon />
                </button>
              ) : null}

              {!isLocked ? (
                <>
                  <button
                    aria-label="Advanced mode"
                    className="advanced-mode-button"
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowMemtierAdvanced(true);
                    }}
                    title="Advanced mode"
                    type="button"
                  >
                    <PopOutIcon />
                  </button>
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
              ) : isRunning ? (
                <button
                  className="running-control"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCancelRun();
                  }}
                  type="button"
                >
                  <RunningIndicator />
                  <span className="stop-run-button">■</span>
                </button>
              ) : run?.status !== 'completed' ? (
                <span className={`scenario-state scenario-state-${run?.status ?? 'queued'}`}>
                  {isLaunching ? 'Launching' : run?.status ?? 'Queued'}
                </span>
              ) : null}
            </>
          )}
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

      <MemtierAdvancedModal
        config={config}
        disabled={disabled}
        onClose={() => setShowMemtierAdvanced(false)}
        onConfigChange={(field, nextValue) => onConfigChange(draft.id, field, nextValue)}
        open={showMemtierAdvanced}
        scenario={scenario}
      />

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

      {databaseSource ? (
        <DatabaseSourceBadge
          className="scenario-source-badge"
          source={databaseSource}
        />
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
  onDelete,
  onRename,
  onCancelRun,
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

  const connectionById = new Map(connections.map((connection) => [connection.id, connection]));

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
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {canOpenCompareMode || compareMode || compareView ? (
          <button
            className={`ghost-button ${compareMode || compareView ? 'is-active' : ''}`}
            disabled={!compareMode && !compareView && !canOpenCompareMode}
            onClick={onToggleCompareMode}
            type="button"
          >
            {compareMode || compareView ? 'Done comparing' : 'Compare'}
          </button>
        ) : null}
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
            const databaseSource =
              run?.databaseSource ??
              connectionById.get(draft.connectionId ?? run?.connectionId)?.databaseSource ??
              null;
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
                databaseSource={databaseSource}
                disabled={hasRunningRuns || runPendingDraftId !== null}
                draft={draft}
                isCustomizing={draft.isCustomizing}
                isLaunching={runPendingDraftId === draft.id}
                isLocked={Boolean(draft.runId)}
                isRunning={run?.status === 'running'}
                isSelected={!compareMode && selectedDraftId === draft.id}
                key={draft.id}
                onCancelRun={onCancelRun}
                onDelete={onDelete}
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

  const firstEntry = payload.find((entry) => entry?.value !== null && entry?.value !== undefined) ?? payload[0];
  if (!firstEntry) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <span>{label}</span>
      <strong>{formatter(firstEntry.value)}</strong>
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

  if (!selected) {
    return null;
  }

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

  if (!selected) {
    return null;
  }

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

function CompareRunLegend({ colorMap, comparedRuns }) {
  return (
    <div className="compare-run-legend">
      {comparedRuns.map(({ draft, run }, index) => (
        <div className="compare-run-legend-item" key={run.id}>
          <span
            className="compare-run-color-dot"
            style={{ backgroundColor: colorMap[index] }}
          />
          <span className="compare-run-legend-name">{getBaseRunLabel(run, draft)}</span>
          <DatabaseSourceBadge
            className="comparison-source-badge"
            source={run.databaseSource}
          />
        </div>
      ))}
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
  if (!selectedOption) {
    return (
      <section className="chart-panel compare-chart-panel">
        <div className="chart-header">
          <div className="chart-title-row">
            <p className="eyebrow">{title}</p>
          </div>
        </div>

        <div className="chart-area">
          <div className="chart-empty">Waiting for samples</div>
        </div>
      </section>
    );
  }
  const data = buildCompareTimelineData(comparedRuns, selectedOption.key);
  const seriesMeta = comparedRuns.map(({ draft, run }, index) => ({
    color: colorMap[index],
    dataKey: `series_${index}`,
    label: getBaseRunLabel(run, draft),
    source: run.databaseSource,
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

      <CompareRunLegend colorMap={colorMap} comparedRuns={comparedRuns} />

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

function LogConsole({ isLive = false, logs }) {
  const scrollerRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const [isPinnedToTop, setIsPinnedToTop] = useState(true);

  function updatePinnedState() {
    if (!scrollerRef.current) {
      return;
    }

    const topOffset = scrollerRef.current.scrollTop;
    const remaining =
      scrollerRef.current.scrollHeight -
      scrollerRef.current.scrollTop -
      scrollerRef.current.clientHeight;
    const nextPinned = remaining < 32;
    const nextAtTop = topOffset < 24;
    stickToBottomRef.current = nextPinned;
    setIsPinnedToBottom(nextPinned);
    setIsPinnedToTop(nextAtTop);
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

      {!isLive && !isPinnedToTop && logs.length ? (
        <button
          className="log-jump log-jump-top"
          onClick={() => {
            if (!scrollerRef.current) {
              return;
            }

            scrollerRef.current.scrollTop = 0;
            setIsPinnedToTop(true);
          }}
          type="button"
        >
          Jump to start
        </button>
      ) : null}

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
  const compareColors = buildCompareColorMap(comparedRuns);

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
                      <DatabaseSourceBadge
                        className="comparison-source-badge"
                        source={run.databaseSource}
                      />
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
    [
      'Average latency',
      'p50 latency',
      'p90 latency',
      'p99 latency',
      'p99.9 latency',
      'Max latency',
    ].includes(item.label),
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
          <p className="metrics-subtitle metrics-subtitle-secondary">
            <GeneratedDataMetric config={run.scenarioConfig ?? {}} run={run} scenario={null} />
            {run?.status === 'running' && hasStaircaseProfile(run.scenarioConfig ?? {}) ? (
              <>
                <span className="scenario-subtitle-separator">•</span>
                <CurrentClientsMetric run={run} />
              </>
            ) : null}
          </p>
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
          <LogConsole isLive={run.status === 'running'} logs={run.logs} />
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
  const [isConnectionFormVisible, setIsConnectionFormVisible] = useState(false);
  const [redisInsightLaunchPendingId, setRedisInsightLaunchPendingId] = useState(null);
  const [datasetLoadContext, setDatasetLoadContext] = useState(null);
  const [missingIndexPrompt, setMissingIndexPrompt] = useState(null);
  const [presetLoadResult, setPresetLoadResult] = useState(null);
  const [showCancelRunPrompt, setShowCancelRunPrompt] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const draftNumberRef = useRef(1);
  const presetFileInputRef = useRef(null);
  const initialPresetNameRef = useRef(getRequestedPresetName());
  const previousPresetNameRef = useRef('');
  const runLaunchSnapshotRef = useRef(null);

  const connections = appState.connections ?? [];
  const hasActiveLoads = connections.some((connection) => connection.load?.status === 'running');
  const selectedConnection =
    connections.find((connection) => connection.id === appState.selectedConnectionId) ??
    connections[0] ??
    null;
  const scenarioMap = new Map(appState.scenarios.map((scenario) => [scenario.id, scenario]));
  const visibleRuns = appState.runs.filter((run) => scenarioMap.has(run.scenarioId));
  const activeRuns = appState.runs.filter((run) => run.status === 'running');
  const hasRunningRuns = activeRuns.length > 0;
  const runningRun = visibleRuns.filter((run) => run.status === 'running').at(-1) ?? null;
  const latestRun = visibleRuns.at(-1) ?? null;
  const runById = new Map(visibleRuns.map((run) => [run.id, run]));
  const draftByRunId = new Map(
    drafts.filter((draft) => draft.runId).map((draft) => [draft.runId, draft]),
  );
  const hasReadyDraft = drafts.some((draft) => !draft.runId);
  const canClear =
    !hasRunningRuns &&
    !hasActiveLoads &&
    runPendingDraftId === null &&
    (drafts.length > 0 || compareMode || compareView);
  const completedRuns = visibleRuns.filter((run) => run.status === 'completed');
  const canOpenCompareMode =
    completedRuns.length >= 2 && !hasRunningRuns && !hasActiveLoads && runPendingDraftId === null;
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
  const datasetLoadPrimaryConnection = datasetLoadContext
    ? connections.find((connection) => connection.id === datasetLoadContext.primaryConnectionId) ?? null
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
    setDrafts((currentDrafts) => {
      const nextDrafts = currentDrafts.filter((draft) => scenarioMap.has(draft.scenarioId));
      return nextDrafts.length === currentDrafts.length ? currentDrafts : nextDrafts;
    });
  }, [appState.scenarios]);

  useEffect(() => {
    if (!visibleRuns.length) {
      return;
    }

    setDrafts((currentDrafts) => {
      let nextDrafts = currentDrafts;
      let changed = false;

      for (const run of visibleRuns) {
        if (nextDrafts.some((draft) => draft.runId === run.id)) {
          continue;
        }

        const pendingDraft =
          runPendingDraftId
            ? nextDrafts.find((draft) => draft.id === runPendingDraftId)
            : null;

        if (
          pendingDraft &&
          !pendingDraft.runId &&
          pendingDraft.scenarioId === run.scenarioId &&
          (pendingDraft.connectionId === null || pendingDraft.connectionId === run.connectionId)
        ) {
          nextDrafts = nextDrafts.map((draft) =>
            draft.id === pendingDraft.id
              ? {
                  ...draft,
                  connectionId: run.connectionId,
                  isCustomizing: false,
                  runId: run.id,
                }
              : draft,
          );
          changed = true;
          continue;
        }

        const scenario = scenarioMap.get(run.scenarioId);
        if (!scenario) {
          continue;
        }

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
  }, [appState.runs, appState.scenarios, runPendingDraftId, visibleRuns]);

  useEffect(() => {
    if (!appState.selectedPresetName) {
      return;
    }

    updatePresetQueryParam(appState.selectedPresetName);
  }, [appState.selectedPresetName]);

  useEffect(() => {
    if (!appState.selectedPresetName) {
      return;
    }

    if (previousPresetNameRef.current && previousPresetNameRef.current !== appState.selectedPresetName) {
      setCompareMode(false);
      setCompareView(false);
      setSelectedComparisonRunIds([]);
      setDatasetLoadContext(null);
      setMissingIndexPrompt(null);
    }

    previousPresetNameRef.current = appState.selectedPresetName;
  }, [appState.selectedPresetName]);

  useEffect(() => {
    setSelectedComparisonRunIds((currentIds) =>
      currentIds.filter((runId) => runById.get(runId)?.status === 'completed'),
    );
  }, [appState.runs]);

  useEffect(() => {
    if (showCancelRunPrompt && !hasRunningRuns && !cancelPending) {
      setShowCancelRunPrompt(false);
    }
  }, [cancelPending, hasRunningRuns, showCancelRunPrompt]);

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
    const requestedPresetName = initialPresetNameRef.current;
    const stateUrl = requestedPresetName
      ? `/api/state?preset=${encodeURIComponent(requestedPresetName)}`
      : '/api/state';

    async function loadInitialState(url) {
      const response = await fetch(url);
      const payload = await readJsonResponse(response, 'Could not load app state.');
      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not load app state.');
      }

      startTransition(() => {
        setAppState(payload);
      });
    }

    loadInitialState(stateUrl).catch(() => {
      if (stateUrl === '/api/state') {
        return;
      }

      loadInitialState('/api/state').catch(() => {});
    });
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
        .then(async (response) => {
          const payload = await readJsonResponse(response, 'Could not refresh app state.');
          if (!response.ok) {
            throw new Error(payload.error ?? 'Could not refresh app state.');
          }

          return payload;
        })
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
            redisInsight: {
              mode: meta.redisInsight?.mode ?? EMPTY_META.redisInsight.mode,
              publicUrl: meta.redisInsight?.publicUrl ?? EMPTY_META.redisInsight.publicUrl,
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

  function handleHostOrUrlPaste(event) {
    const pastedText = event.clipboardData?.getData('text') ?? '';
    if (!pastedText) {
      return;
    }

    const parsedClipboardValue = extractHostAndPortFromText(pastedText);
    const targetValue = event.target.value ?? '';
    const selectionStart = event.target.selectionStart ?? targetValue.length;
    const selectionEnd = event.target.selectionEnd ?? targetValue.length;
    const combinedValue = `${targetValue.slice(0, selectionStart)}${pastedText}${targetValue.slice(selectionEnd)}`;
    const parsedValue = parsedClipboardValue ?? extractHostAndPortFromText(combinedValue);

    if (!parsedValue) {
      return;
    }

    event.preventDefault();
    setFormState((currentForm) => ({
      ...currentForm,
      hostOrUrl: parsedValue.hostOrUrl,
      port: parsedValue.port,
    }));
    setConnectError('');
  }

  function handleScenarioConfigChange(scenarioId, field, nextValue) {
    const draft = drafts.find((entry) => entry.id === scenarioId);
    const scenario = draft ? scenarioMap.get(draft.scenarioId) : null;
    if (!scenario || !draft) {
      return;
    }

    setDrafts((currentDrafts) =>
      currentDrafts.map((entry) =>
        entry.id === scenarioId
          ? {
              ...entry,
              config: applyScenarioDraftConfigChange(entry.config, scenario, field, nextValue),
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

  async function handleOpenRedisInsight(connectionId) {
    if (!connectionId) {
      return;
    }

    setConnectError('');
    setRedisInsightLaunchPendingId(connectionId);

    try {
      const response = await fetch(`/api/connections/${connectionId}/redisinsight/launch`, {
        method: 'POST',
      });
      const payload = await readJsonResponse(response, 'Could not open Redis Insight.');
      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not open Redis Insight.');
      }

      const launchedUrl = String(payload.url ?? '').trim();
      if (!launchedUrl) {
        throw new Error('Redis Insight did not return a launch URL.');
      }

      if (launchedUrl.startsWith('redisinsight://')) {
        window.location.assign(launchedUrl);
        return;
      }

      window.open(launchedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setConnectError(error.message);
    } finally {
      setRedisInsightLaunchPendingId(null);
    }
  }

  function handlePrepareAddConnection() {
    setFormState(BLANK_CONNECTION_FORM);
    setConnectError('');
  }

  async function handlePresetChange(nextPresetName) {
    if (!nextPresetName) {
      return;
    }

    if (nextPresetName === UPLOAD_PRESET_OPTION) {
      if (presetFileInputRef.current) {
        presetFileInputRef.current.value = '';
        presetFileInputRef.current.click();
      }
      return;
    }

    setConnectError('');
    setPresetLoadResult(null);

    try {
      const response = await fetch('/api/presets/select', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ presetName: nextPresetName }),
      });
      const payload = await readJsonResponse(response, 'Could not switch presets.');

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not switch presets.');
      }

      startTransition(() => {
        setAppState(payload.state ?? EMPTY_APP_STATE);
      });
      updatePresetQueryParam(payload.state?.selectedPresetName ?? nextPresetName);
    } catch (error) {
      setPresetLoadResult({
        message: error.message,
        title: 'Could not switch preset',
        tone: 'error',
      });
    }
  }

  async function handlePresetFileSelection(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setConnectError('');
    setPresetLoadResult(null);

    try {
      const contents = await file.text();
      const validation = extractPresetNameFromContents(contents);

      if (validation.error) {
        throw new Error(validation.error);
      }

      if (appState.presetOptions.some((preset) => preset.name === validation.name)) {
        throw new Error(
          `Preset "${validation.name}" already exists. Rename the preset in the YAML file and try again.`,
        );
      }

      const response = await fetch('/api/presets/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          fileName: file.name,
        }),
      });
      const payload = await readJsonResponse(response, 'Could not load the preset file.');

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not load the preset file.');
      }

      startTransition(() => {
        setAppState(payload.state ?? EMPTY_APP_STATE);
      });
      updatePresetQueryParam(payload.state?.selectedPresetName ?? validation.name);
      setPresetLoadResult({
        message:
          payload.message ??
          `Loaded preset "${payload.state?.selectedPresetName ?? validation.name}".`,
        title: 'Preset loaded',
        tone: 'success',
      });
    } catch (error) {
      setPresetLoadResult({
        message: error.message,
        title: 'Could not load preset',
        tone: 'error',
      });
    } finally {
      event.target.value = '';
    }
  }

  function handleOpenDatasetLoad(connection, options = {}) {
    setConnectError('');
    setMissingIndexPrompt(null);
    setDatasetLoadContext({
      primaryConnectionId: connection.id,
      initialAllConnections: Boolean(options.initialAllConnections),
      initialPresetId:
        options.initialPresetId ??
        appState.datasetPresets[0]?.id ??
        CUSTOM_DATASET_PRESET.id,
      notice: options.notice ?? '',
    });
  }

  async function handleLoadDataset({
    connectionIds,
    datasetYaml,
    datasetPresetName,
    flushEnabled,
    storageYaml,
  }) {
    setConnectError('');

    const response = await fetch('/api/load-dataset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connectionIds,
        datasetYaml,
        datasetPresetName,
        flushEnabled,
        storageYaml,
      }),
    });
    const payload = await readJsonResponse(
      response,
      'Could not load the dataset.',
    );

    if (!response.ok) {
      throw new Error(payload.error ?? 'Could not load the dataset.');
    }

    startTransition(() => {
      setAppState(payload.state ?? EMPTY_APP_STATE);
    });
  }

  async function handleRun(draftId, scope = 'selected') {
    setConnectError('');
    setRunPendingDraftId(draftId);

    try {
      const draft = drafts.find((entry) => entry.id === draftId);
      if (!draft) {
        throw new Error('Could not find the selected test.');
      }
      const scenario = scenarioMap.get(draft.scenarioId) ?? null;

      const launchSnapshot = {
        drafts,
        selectedDraftId,
      };

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
        if (payload.code === 'missing_required_index') {
          const suggestedPreset = findDatasetPresetForScenario(
            appState.datasetPresets,
            scenario,
            payload.missingIndexes,
          );
          const missingConnectionId =
            scope === 'all'
              ? selectedConnection?.id ?? payload.missingConnections?.[0]?.id
              : payload.missingConnections?.[0]?.id ?? selectedConnection?.id;
          const targetConnection =
            connections.find((connection) => connection.id === missingConnectionId) ??
            selectedConnection ??
            connections[0];

          if (targetConnection) {
            setMissingIndexPrompt({
              connectionNames: (payload.missingConnections ?? []).map((entry) => entry.name),
              datasetName: suggestedPreset.name,
              indexNames: payload.missingIndexes ?? [],
              loadOptions: {
                initialAllConnections: scope === 'all',
                initialPresetId: suggestedPreset.id,
                notice:
                  payload.error ??
                  `This benchmark requires ${payload.missingIndexes?.join(', ')}. Load ${suggestedPreset.name} before tuning it.`,
                primaryConnectionId: targetConnection.id,
              },
            });
            return;
          }
        }

        throw new Error(payload.error ?? 'Run failed to start.');
      }

      runLaunchSnapshotRef.current = launchSnapshot;

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
          const launchedRunIds = new Set(payload.runs.map((run) => run.id));

          setDrafts((currentDrafts) => [
            ...generatedDrafts,
            ...currentDrafts.filter(
              (entry) => entry.id !== draftId && !launchedRunIds.has(entry.runId),
            ),
          ]);

          const preferredDraft = generatedDrafts.find((entry) => entry.runId === preferredRun?.id);
          setSelectedDraftId(preferredDraft?.id ?? draftId);
        }
      } else {
        const nextRun = payload.runs?.[0] ?? null;
        setDrafts((currentDrafts) => {
          const dedupedDrafts =
            nextRun?.id
              ? currentDrafts.filter((entry) => entry.id === draftId || entry.runId !== nextRun.id)
              : currentDrafts;

          return dedupedDrafts.map((entry) =>
            entry.id === draftId
              ? {
                  ...entry,
                  connectionId: nextRun?.connectionId ?? entry.connectionId,
                  isCustomizing: false,
                  runId: nextRun?.id ?? entry.runId,
                }
              : entry,
          );
        });
        setSelectedDraftId(draftId);
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
    } catch (error) {
      setConnectError(error.message);
    } finally {
      setRunPendingDraftId(null);
    }
  }

  async function handleCancelRun() {
    if (cancelPending) {
      return;
    }

    if (!hasRunningRuns) {
      setShowCancelRunPrompt(false);
      setConnectError('');
      return;
    }

    setConnectError('');
    setCancelPending(true);

    try {
      const response = await fetch('/api/run/cancel', {
        method: 'POST',
      });
      const payload = await readJsonResponse(response, 'Cancel failed.');

      if (!response.ok) {
        throw new Error(payload.error ?? 'Cancel failed.');
      }

      const snapshot = runLaunchSnapshotRef.current;

      startTransition(() => {
        setAppState(payload.state ?? EMPTY_APP_STATE);
      });

      if (!(payload.canceledRunIds?.length > 0)) {
        runLaunchSnapshotRef.current = null;
        setShowCancelRunPrompt(false);
        return;
      }

      if (snapshot) {
        setDrafts(snapshot.drafts.map((draft) => ({ ...draft, isCustomizing: false })));
        setSelectedDraftId(snapshot.selectedDraftId);
      } else {
        const canceledRunIds = payload.canceledRunIds ?? [];
        setDrafts((currentDrafts) =>
          currentDrafts.map((draft) =>
            canceledRunIds.includes(draft.runId)
              ? {
                  ...draft,
                  isCustomizing: false,
                  runId: null,
                }
              : draft,
          ),
        );
      }

      runLaunchSnapshotRef.current = null;
      setShowCancelRunPrompt(false);
    } catch (error) {
      if (error.message === 'There is no active benchmark to cancel.') {
        setShowCancelRunPrompt(false);
        return;
      }

      setConnectError(error.message);
    } finally {
      setCancelPending(false);
    }
  }

  const validationError = hasConnectionFormInput(formState) ? validateConnectionForm(formState) : '';
  const rawValidationError = validateConnectionForm(formState);
  const connectDisabled =
    Boolean(rawValidationError) ||
    connectPending ||
    setupState.status !== 'ready' ||
    hasRunningRuns ||
    hasActiveLoads ||
    connections.length >= 4;

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

  async function handleDeleteDraft(draftId) {
    const draft = drafts.find((entry) => entry.id === draftId);
    if (!draft) {
      return;
    }

    setConnectError('');

    const removeDraftFromList = () => {
      const remainingDrafts = drafts.filter((entry) => entry.id !== draftId);
      setDrafts(remainingDrafts);

      if (selectedDraftId === draftId) {
        setSelectedDraftId(remainingDrafts[0]?.id ?? null);
      }
    };

    if (!draft.runId) {
      removeDraftFromList();
      return;
    }

    try {
      const response = await fetch(`/api/run/${encodeURIComponent(draft.runId)}`, {
        method: 'DELETE',
      });
      const payload = await readJsonResponse(response, 'Delete failed.');

      if (!response.ok) {
        throw new Error(payload.error ?? 'Delete failed.');
      }

      startTransition(() => {
        setAppState(payload.state ?? EMPTY_APP_STATE);
      });
      setSelectedComparisonRunIds((currentIds) => {
        const nextIds = currentIds.filter((runId) => runId !== draft.runId);
        if (nextIds.length < 2) {
          setCompareView(false);
        }
        return nextIds;
      });
      removeDraftFromList();
    } catch (error) {
      setConnectError(error.message);
    }
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
        connectError={connectError}
        connectPending={connectPending}
        connections={connections}
        formState={formState}
        hasActiveLoads={hasActiveLoads}
        hasRunningRuns={hasRunningRuns}
        onConnect={handleConnect}
        onConnectionFormVisibilityChange={setIsConnectionFormVisible}
        onDisconnect={handleDisconnect}
        onFormChange={handleFormChange}
        onHostOrUrlPaste={handleHostOrUrlPaste}
        onLoadDataset={handleOpenDatasetLoad}
        onPrepareAddConnection={handlePrepareAddConnection}
        onPresetChange={handlePresetChange}
        onOpenRedisInsight={handleOpenRedisInsight}
        onRenameConnection={handleRenameConnection}
        onSelectConnection={handleSelectConnection}
        presetOptions={appState.presetOptions}
        presetSelectionDisabled={hasRunningRuns || hasActiveLoads}
        redisInsightActionTitle={
          appMeta.redisInsight.mode === 'web'
            ? 'Opens Redis Insight web in a new tab. Remote deployments should use this path.'
            : 'Opens the local Redis Insight desktop app if it is installed.'
        }
        redisInsightDisabled={
          !appState.canOpenRedisInsight || redisInsightLaunchPendingId !== null
        }
        selectedConnectionId={selectedConnection?.id ?? null}
        selectedPresetName={appState.selectedPresetName}
        setup={setupState}
        validationError={validationError}
      />
      {connectError && !isConnectionFormVisible ? (
        <div className="error-banner">{connectError}</div>
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
            hasRunningRuns={hasRunningRuns || hasActiveLoads}
            onCancelRun={() => setShowCancelRunPrompt(true)}
            onClear={handleClear}
            onCompareSelected={handleCompareSelected}
            onDelete={handleDeleteDraft}
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

      <DatasetLoadModal
        allConnections={connections}
        datasetPresets={appState.datasetPresets}
        initialAllConnections={Boolean(datasetLoadContext?.initialAllConnections)}
        initialPresetId={
          datasetLoadContext?.initialPresetId ??
          appState.datasetPresets[0]?.id ??
          CUSTOM_DATASET_PRESET.id
        }
        notice={datasetLoadContext?.notice ?? ''}
        onClose={() => setDatasetLoadContext(null)}
        onLoad={handleLoadDataset}
        open={Boolean(datasetLoadContext)}
        primaryConnection={datasetLoadPrimaryConnection}
      />

      <MissingIndexModal
        connectionNames={missingIndexPrompt?.connectionNames ?? []}
        datasetName={missingIndexPrompt?.datasetName ?? ''}
        indexNames={missingIndexPrompt?.indexNames ?? []}
        onCancel={() => setMissingIndexPrompt(null)}
        onLoadDataset={() => {
          const prompt = missingIndexPrompt;
          if (!prompt) {
            return;
          }

          const primaryConnection =
            connections.find(
              (connection) => connection.id === prompt.loadOptions.primaryConnectionId,
            ) ?? connections[0];

          if (!primaryConnection) {
            setMissingIndexPrompt(null);
            return;
          }

          handleOpenDatasetLoad(primaryConnection, prompt.loadOptions);
        }}
        open={Boolean(missingIndexPrompt)}
      />

      <CancelRunModal
        onCancel={() => {
          if (cancelPending) {
            return;
          }
          setShowCancelRunPrompt(false);
        }}
        onConfirm={handleCancelRun}
        pending={cancelPending}
        open={showCancelRunPrompt}
      />

      <PresetLoadResultModal
        message={presetLoadResult?.message ?? ''}
        onClose={() => setPresetLoadResult(null)}
        open={Boolean(presetLoadResult)}
        title={presetLoadResult?.title ?? ''}
        tone={presetLoadResult?.tone ?? 'success'}
      />

      <input
        accept=".yaml,.yml,text/yaml,application/yaml"
        hidden
        onChange={handlePresetFileSelection}
        ref={presetFileInputRef}
        type="file"
      />
    </div>
  );
}
