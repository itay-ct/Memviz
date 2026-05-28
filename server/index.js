import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { createClient } from 'redis';
import { WebSocket, WebSocketServer } from 'ws';

import { loadDatasetIntoRedis } from './dataset-loader.js';
import {
  getPresetClientState,
  getScenarioById,
  importPresetFile,
  initializePresetLibrary,
  refreshPresetLibrary,
  selectPresetByName,
} from './preset-library.js';
import { buildRedisUrl, normalizeRedisTarget } from './redis-target.js';
import { buildRunnableScenario } from './scenarios.js';
import {
  appendLog,
  clearRuns,
  createConnection,
  createRun,
  finishConnectionLoad,
  finishRun,
  hasActiveLoads,
  getConnection,
  getConnections,
  getRun,
  getRunningRuns,
  getSelectedConnection,
  getStateSnapshot,
  hasRunningRuns,
  recordMetric,
  recordSummaryLine,
  removeRuns,
  removeConnection,
  renameConnection,
  selectConnection,
  serializeRun,
  startConnectionLoad,
  updateConnectionLoad,
  updateConnectionRtt,
} from './store.js';
import {
  assertRuntimeSupportsScenario,
  buildMemtierCommand,
  launchMemtier,
  measureConnectionLatency,
  MEMTIER_REPO_URL,
  MIN_MEMTIER_VERSION,
  resolveMemtierRuntime,
  STATSD_HOST,
  STATSD_PORT,
} from './memtier.js';
import { parseMemtierProgressPercent } from './memtier-summary.js';
import {
  createRedisInsightProxyHandler,
  createRedisInsightService,
  getRedisInsightConfig,
} from './redisinsight.js';
import { createSetupManager } from './setup-manager.js';
import { createStatsdReceiver } from './statsd.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const redisInsightProxyWss = new WebSocketServer({ noServer: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const REDIS_CONNECT_TIMEOUT_MS = 3000;
const APP_VERSION = '1.3.1';
const APP_PORT = Number(process.env.PORT ?? 3000);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const MAX_CONNECTIONS = 3;
const DEFAULT_REDIS_HOST = process.env.MEMVIZ_DEFAULT_REDIS_HOST ?? '127.0.0.1';
const DEFAULT_REDIS_PORT = process.env.MEMVIZ_DEFAULT_REDIS_PORT ?? '6379';
const REDISINSIGHT_CONFIG = getRedisInsightConfig(process.env);
const DEFAULT_TARGET_INPUT = {
  hostOrUrl: DEFAULT_REDIS_HOST,
  port: DEFAULT_REDIS_PORT,
  username: 'default',
  password: '',
};
const DEFAULT_TARGET_NAME = `${DEFAULT_REDIS_HOST}:${DEFAULT_REDIS_PORT}`;
let attemptedDefaultConnectionBootstrap = false;
const rttProbeConnectionIds = new Set();
const runningMemtierChildren = new Map();
const FATAL_MEMTIER_PATTERNS = [
  {
    regex: /max number of clients reached/i,
    message: (line) => `Redis refused benchmark connections: ${line}`,
  },
  {
    regex: /syntax error at offset/i,
    message: (line) =>
      `Redis rejected the benchmark command syntax: ${line}. This usually means the query syntax or index field type does not match the benchmark command.`,
  },
  {
    regex: /cluster slot failed/i,
    message: (line) =>
      `Cluster Aware requires a Redis Cluster target. Memtier could not read cluster slots from Redis: ${line}`,
  },
];

const redisInsightService = createRedisInsightService({
  apiUrl: REDISINSIGHT_CONFIG.apiUrl,
  publicUrl: REDISINSIGHT_CONFIG.publicUrl,
});
const redisInsightProxyHandler = createRedisInsightProxyHandler({
  apiUrl: REDISINSIGHT_CONFIG.apiUrl,
  publicPath: REDISINSIGHT_CONFIG.publicPath,
});

if (redisInsightProxyHandler && REDISINSIGHT_CONFIG.publicPath) {
  app.use((req, res, next) => {
    if (
      req.path === REDISINSIGHT_CONFIG.publicPath ||
      req.path.startsWith(`${REDISINSIGHT_CONFIG.publicPath}/`)
    ) {
      redisInsightProxyHandler(req, res);
      return;
    }

    next();
  });
}

app.use(express.json());

const setupManager = createSetupManager({
  appPort: APP_PORT,
  appUrl: APP_URL,
  onUpdate: (setup) => {
    broadcast({
      type: 'setup_state',
      setup,
    });

    if (setup.status === 'ready') {
      void bootstrapDefaultConnectionIfAvailable();
    }
  },
});

function broadcast(payload) {
  const message = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function sendSnapshot(socket) {
  socket.send(
    JSON.stringify({
      type: 'snapshot',
      state: toPublicState(),
    }),
  );
}

function broadcastState() {
  broadcast({
    type: 'snapshot',
    state: toPublicState(),
  });
}

function classifyFatalMemtierLine(text) {
  for (const pattern of FATAL_MEMTIER_PATTERNS) {
    if (pattern.regex.test(text)) {
      return pattern.message(text);
    }
  }

  return null;
}

function recordMemtierProgressLine(runId, text) {
  const progressPercent = parseMemtierProgressPercent(text);
  if (progressPercent === null) {
    return;
  }

  const timestamp = new Date().toISOString();
  const run = recordMetric(runId, {
    metric: 'progress_pct',
    value: progressPercent,
    timestamp,
  });
  if (!run) {
    return;
  }

  broadcast({
    type: 'metric',
    runId,
    metric: 'progress_pct',
    value: progressPercent,
    metrics: run.metrics,
    series: run.series,
    timestamp,
  });
}

async function verifyRedisConnection(target) {
  const client = createClient({
    url: buildRedisUrl(target),
  });
  let timeoutId;

  client.on('error', () => {});

  try {
    const response = await Promise.race([
      (async () => {
        await client.connect();
        return client.ping();
      })(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutError = new Error(
            `Connection attempt timed out after ${REDIS_CONNECT_TIMEOUT_MS / 1000} seconds.`,
          );
          timeoutError.kind = 'connection';
          reject(timeoutError);
        }, REDIS_CONNECT_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(timeoutId);

    if (response !== 'PONG') {
      throw new Error('Redis did not return PONG.');
    }
  } catch (error) {
    const wrappedError = new Error(`Could not connect to Redis at ${target.summary}. ${error.message}`);
    wrappedError.kind = error.kind ?? 'connection';
    throw wrappedError;
  } finally {
    clearTimeout(timeoutId);

    if (client.isOpen) {
      await client.disconnect().catch(() => {});
    } else if (typeof client.destroy === 'function') {
      client.destroy();
    }
  }
}

async function startConnectionRttProbe(connectionId) {
  if (rttProbeConnectionIds.has(connectionId)) {
    return;
  }

  const connection = getConnection(connectionId);
  if (!connection) {
    return;
  }

  rttProbeConnectionIds.add(connectionId);

  try {
    const runtime = await resolveMemtierRuntime();
    const rttMs = await measureConnectionLatency({
      runtime,
      target: connection.target,
    });
    const updatedConnection = updateConnectionRtt(connectionId, rttMs);
    if (updatedConnection) {
      broadcastState();
    }
  } catch (error) {
    console.warn(`RTT probe failed for ${connection.target.summary}: ${error.message}`);
  } finally {
    rttProbeConnectionIds.delete(connectionId);
  }
}

async function bootstrapDefaultConnectionIfAvailable() {
  if (attemptedDefaultConnectionBootstrap) {
    return;
  }

  attemptedDefaultConnectionBootstrap = true;

  if (getConnections().length > 0) {
    return;
  }

  try {
    const target = normalizeRedisTarget(DEFAULT_TARGET_INPUT);
    await verifyRedisConnection(target);
    const connection = createConnection({
      id: randomUUID(),
      name: DEFAULT_TARGET_NAME,
      target,
    });
    broadcastState();
    void startConnectionRttProbe(connection.id);
  } catch {
    // Leave the workspace disconnected when local Redis is unavailable.
  }
}

function withStatus(res, error) {
  if (error.kind === 'validation') {
    return res.status(400);
  }

  if (error.kind === 'capability') {
    return res.status(409);
  }

  return res.status(502);
}

async function commandSupportedOnTarget(target, commandName) {
  const client = createClient({
    url: buildRedisUrl(target),
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    },
  });

  client.on('error', () => {});

  try {
    await client.connect();
    const response = await client.sendCommand(['COMMAND', 'INFO', commandName]);
    return Array.isArray(response) ? Boolean(response[0]) : Boolean(response);
  } catch {
    return false;
  } finally {
    if (client.isOpen) {
      await client.disconnect().catch(() => {});
    } else if (typeof client.destroy === 'function') {
      client.destroy();
    }
  }
}

function normalizeIndexNameToken(token = '') {
  const trimmed = String(token).trim();
  if (!trimmed) {
    return '';
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function extractRequiredSearchIndexes(command, fallbackIndexes = []) {
  const trimmed = String(command ?? '').trim();
  if (!trimmed) {
    return [...fallbackIndexes];
  }
  const match = trimmed.match(/^(FT\.(?:SEARCH|AGGREGATE))\s+("[^"]+"|'[^']+'|\S+)/i);

  if (match?.[2]) {
    const indexName = normalizeIndexNameToken(match[2]);
    return indexName ? [indexName] : [...fallbackIndexes];
  }

  return [];
}

async function listSearchIndexes(target) {
  const client = createClient({
    url: buildRedisUrl(target),
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    },
  });

  client.on('error', () => {});

  try {
    await client.connect();
    const response = await client.sendCommand(['FT._LIST']);
    if (!Array.isArray(response)) {
      return [];
    }

    return response
      .map((entry) => {
        if (Buffer.isBuffer(entry)) {
          return entry.toString('utf8');
        }

        return String(entry ?? '').trim();
      })
      .filter(Boolean);
  } catch {
    return [];
  } finally {
    if (client.isOpen) {
      await client.disconnect().catch(() => {});
    } else if (typeof client.destroy === 'function') {
      client.destroy();
    }
  }
}

async function findMissingRequiredIndexes(connections, scenario) {
  const requiredIndexes = extractRequiredSearchIndexes(
    scenario?.config?.command,
    scenario?.requiredIndexes ?? [],
  );

  if (!requiredIndexes.length) {
    return null;
  }

  const checks = await Promise.all(
    connections.map(async (connection) => {
      const supportsSearch = await commandSupportedOnTarget(connection.target, 'FT.SEARCH');
      if (!supportsSearch) {
        return {
          connection,
          supportsSearch: false,
          missingIndexes: requiredIndexes,
        };
      }

      const availableIndexes = new Set(await listSearchIndexes(connection.target));
      const missingIndexes = requiredIndexes.filter((indexName) => !availableIndexes.has(indexName));

      return {
        connection,
        supportsSearch: true,
        missingIndexes,
      };
    }),
  );

  const unsupportedConnections = checks
    .filter((entry) => entry.supportsSearch === false)
    .map((entry) => ({
      id: entry.connection.id,
      name: entry.connection.name,
      summary: entry.connection.target.summary,
    }));

  if (unsupportedConnections.length) {
    return {
      unsupportedSearch: true,
      missingIndexes: requiredIndexes,
      unsupportedConnections,
      missingConnections: [],
    };
  }

  const missingConnections = checks
    .filter((entry) => entry.missingIndexes.length)
    .map((entry) => ({
      id: entry.connection.id,
      name: entry.connection.name,
      summary: entry.connection.target.summary,
      missingIndexes: entry.missingIndexes,
    }));

  if (!missingConnections.length) {
    return null;
  }

  return {
    missingIndexes: [...new Set(missingConnections.flatMap((entry) => entry.missingIndexes))],
    missingConnections,
  };
}

function createDatasetLoadRequestHandler(connectionIdsResolver) {
  return async (req, res) => {
    try {
      if (!setupManager.isReady()) {
        res.status(409).json({
          success: false,
          error: 'Complete the memviz setup before loading a dataset.',
        });
        return;
      }

      if (hasRunningRuns()) {
        res.status(409).json({
          success: false,
          error: 'Wait for the current benchmark run to finish before loading data.',
        });
        return;
      }

      if (hasActiveLoads()) {
        res.status(409).json({
          success: false,
          error: 'Only one dataset load can run at a time.',
        });
        return;
      }

      const resolvedIds = connectionIdsResolver(req);
      const requestedIds = Array.from(
        new Set(
          (Array.isArray(resolvedIds) ? resolvedIds : [])
            .map((value) => String(value ?? '').trim())
            .filter(Boolean),
        ),
      );

      if (!requestedIds.length) {
        res.status(400).json({
          success: false,
          error: 'Choose at least one Redis connection to load.',
        });
        return;
      }

      const targetConnections = requestedIds.map((connectionId) => getConnection(connectionId)).filter(Boolean);

      if (targetConnections.length !== requestedIds.length) {
        res.status(404).json({
          success: false,
          error: 'One or more Redis connections could not be found.',
        });
        return;
      }

      const flushEnabled = req.body?.flushEnabled !== false;
      const datasetYaml = String(req.body?.datasetYaml ?? '');
      const storageYaml = String(req.body?.storageYaml ?? '');
      const presetName =
        String(req.body?.datasetPresetName ?? req.body?.presetName ?? '').trim() || null;

      targetConnections.forEach((connection) => {
        startConnectionLoad(connection.id, { presetName });
      });
      broadcastState();

      for (const connection of targetConnections) {
        loadDatasetIntoRedis({
          datasetYaml,
          flushEnabled,
          onProgress: ({ message, progressPct, status, summary }) => {
            if (status === 'completed') {
              finishConnectionLoad(connection.id, {
                message,
                summary,
              });
            } else {
              updateConnectionLoad(connection.id, {
                message,
                progressPct,
                status: 'running',
              });
            }

            broadcastState();
          },
          storageYaml,
          target: connection.target,
        }).catch((error) => {
          finishConnectionLoad(connection.id, {
            error: error.message,
            message: 'Dataset load failed',
          });
          broadcastState();
        });
      }

      res.status(202).json({
        success: true,
        state: toPublicState(),
      });
    } catch (error) {
      console.error(`dataset load request failed: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message || 'Dataset load request failed.',
      });
    }
  };
}

function toPublicState() {
  return {
    ...getStateSnapshot(),
    ...getPresetClientState(),
    canOpenRedisInsight: true,
  };
}

function terminateChildProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.killed) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    child.once('exit', finish);

    try {
      child.kill('SIGTERM');
    } catch {
      finish();
      return;
    }

    setTimeout(() => {
      if (settled || child.exitCode !== null || child.killed) {
        finish();
        return;
      }

      try {
        child.kill('SIGKILL');
      } catch {
        finish();
      }
    }, 1200).unref();
  });
}

app.get('/api/state', async (req, res) => {
  try {
    await initializePresetLibrary(
      req.query?.preset ? String(req.query.preset).trim() : null,
    );

    res.json(toPublicState());
  } catch (error) {
    withStatus(res, error).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/presets/select', async (req, res) => {
  if (hasRunningRuns()) {
    res.status(409).json({
      success: false,
      error: 'Wait for the current benchmark run to finish before switching presets.',
    });
    return;
  }

  if (hasActiveLoads()) {
    res.status(409).json({
      success: false,
      error: 'Wait for the current dataset load to finish before switching presets.',
    });
    return;
  }

  try {
    await refreshPresetLibrary();
    selectPresetByName(String(req.body?.presetName ?? '').trim());
    const state = toPublicState();
    broadcastState();
    res.json({
      success: true,
      state,
    });
  } catch (error) {
    withStatus(res, error).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/presets/import', async (req, res) => {
  if (hasRunningRuns()) {
    res.status(409).json({
      success: false,
      error: 'Wait for the current benchmark run to finish before loading a preset file.',
    });
    return;
  }

  if (hasActiveLoads()) {
    res.status(409).json({
      success: false,
      error: 'Wait for the current dataset load to finish before loading a preset file.',
    });
    return;
  }

  try {
    const result = await importPresetFile({
      contents: req.body?.contents,
      fileName: req.body?.fileName,
    });
    const state = toPublicState();
    broadcastState();
    res.json({
      success: true,
      state,
      message: `Loaded preset "${result.preset.label}" and saved it as ${result.savedFileName}.`,
    });
  } catch (error) {
    withStatus(res, error).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/meta', async (_req, res) => {
  const setup = setupManager.getSnapshot();
  res.json({
    success: true,
    appVersion: APP_VERSION,
    appPort: APP_PORT,
    appUrl: APP_URL,
    memtier: {
      kind: setup.runtimeKind,
      version: setup.version,
      minimumVersion: MIN_MEMTIER_VERSION,
      repoUrl: MEMTIER_REPO_URL,
    },
    redisInsight: {
      mode: redisInsightService.isWebConfigured() ? 'web' : 'desktop',
      publicUrl: REDISINSIGHT_CONFIG.publicUrl,
    },
  });
});

app.get('/api/setup', (_req, res) => {
  res.json({
    success: true,
    setup: setupManager.getSnapshot(),
  });
});

app.post('/api/setup', async (req, res) => {
  setupManager.start({ force: Boolean(req.body?.force) }).catch((error) => {
    console.error(`memviz setup failed: ${error.message}`);
  });

  res.status(202).json({
    success: true,
    setup: setupManager.getSnapshot(),
  });
});

app.post('/api/connect', async (req, res) => {
  if (!setupManager.isReady()) {
    res.status(409).json({
      success: false,
      error: 'Finish the memtier setup before connecting to Redis.',
    });
    return;
  }

  if (hasRunningRuns()) {
    res.status(409).json({
      success: false,
      error: 'Wait for the current benchmark run to finish before changing targets.',
    });
    return;
  }

  if (hasActiveLoads()) {
    res.status(409).json({
      success: false,
      error: 'Wait for the current dataset load to finish before changing targets.',
    });
    return;
  }

  if (getConnections().length >= MAX_CONNECTIONS) {
    res.status(409).json({
      success: false,
      error: `You can keep up to ${MAX_CONNECTIONS} Redis connections at once.`,
    });
    return;
  }

  try {
    const target = normalizeRedisTarget(req.body);
    await verifyRedisConnection(target);
    const connection = createConnection({
      id: randomUUID(),
      name: req.body?.name,
      target,
    });

    const state = toPublicState();
    broadcastState();
    void startConnectionRttProbe(connection.id);

    res.json({ success: true, connection, state });
  } catch (error) {
    withStatus(res, error).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/connections/select', (req, res) => {
  const connection = selectConnection(req.body?.connectionId);

  if (!connection) {
    res.status(404).json({
      success: false,
      error: 'Connection not found.',
    });
    return;
  }

  const state = toPublicState();
  broadcastState();
  res.json({ success: true, connection, state });
});

app.patch('/api/connections/:id', (req, res) => {
  const connection = renameConnection(req.params.id, req.body?.name);

  if (!connection) {
    res.status(404).json({
      success: false,
      error: 'Connection not found.',
    });
    return;
  }

  const state = toPublicState();
  broadcastState();
  res.json({ success: true, connection, state });
});

app.post('/api/connections/:id/redisinsight/launch', async (req, res) => {
  const connection = getConnection(req.params.id);

  if (!connection) {
    res.status(404).json({
      success: false,
      error: 'Connection not found.',
    });
    return;
  }

  try {
    const launched = await redisInsightService.launch(connection.target, {
      databaseAlias: connection.name,
    });

    res.json({
      success: true,
      url: launched.url,
    });
  } catch (error) {
    const message = error.kind === 'redisinsight'
      ? error.message
      : `Could not launch RedisInsight. ${error.message}`;

    res.status(502).json({
      success: false,
      error: message,
    });
  }
});

app.post('/api/disconnect', (req, res) => {
  if (hasRunningRuns()) {
    res.status(409).json({
      success: false,
      error: 'Disconnect is disabled while a benchmark is running.',
    });
    return;
  }

  if (hasActiveLoads()) {
    res.status(409).json({
      success: false,
      error: 'Disconnect is disabled while a dataset load is running.',
    });
    return;
  }

  const connection = removeConnection(req.body?.connectionId);
  if (!connection) {
    res.status(404).json({
      success: false,
      error: 'Connection not found.',
    });
    return;
  }

  const state = toPublicState();
  broadcastState();
  res.json({ success: true, connection, state });
});

app.post('/api/clear', (_req, res) => {
  if (hasRunningRuns()) {
    res.status(409).json({
      success: false,
      error: 'Clear is disabled while a benchmark is running.',
    });
    return;
  }

  clearRuns();
  const state = toPublicState();
  broadcast({
    type: 'snapshot',
    state,
  });
  res.json({ success: true, state });
});

app.post(
  '/api/connections/:id/load-dataset',
  createDatasetLoadRequestHandler((req) => [req.params.id]),
);

app.post(
  '/api/load-dataset',
  createDatasetLoadRequestHandler((req) =>
    Array.isArray(req.body?.connectionIds) ? req.body.connectionIds : [],
  ),
);

app.post('/api/run', async (req, res) => {
  if (!setupManager.isReady()) {
    res.status(409).json({
      success: false,
      error: 'Complete the memviz setup before starting a benchmark.',
    });
    return;
  }

  const selectedConnection = getSelectedConnection();
  if (!selectedConnection) {
    res.status(409).json({
      success: false,
      error: 'Connect to Redis before starting a benchmark.',
    });
    return;
  }

  if (hasRunningRuns()) {
    res.status(409).json({
      success: false,
      error: 'Only one benchmark run can be active at a time.',
    });
    return;
  }

  if (hasActiveLoads()) {
    res.status(409).json({
      success: false,
      error: 'Wait for the current dataset load to finish before starting a benchmark.',
    });
    return;
  }

  const selectedScenario = getScenarioById(req.body?.scenarioId);
  if (!selectedScenario) {
    res.status(404).json({
      success: false,
      error: 'Unknown scenario.',
    });
    return;
  }

  let scenario;
  try {
    scenario = buildRunnableScenario(selectedScenario, req.body?.config);
  } catch (error) {
    withStatus(res, error).json({
      success: false,
      error: error.message,
    });
    return;
  }

  const runScope = req.body?.scope === 'all' ? 'all' : 'selected';
  const connections =
    runScope === 'all'
      ? getConnections()
      : [getConnection(req.body?.connectionId) ?? selectedConnection].filter(Boolean);

  if (!connections.length) {
    res.status(409).json({
      success: false,
      error: 'Pick a Redis connection before starting a benchmark.',
    });
    return;
  }

  const missingIndexCheck = await findMissingRequiredIndexes(connections, scenario);
  if (missingIndexCheck) {
    if (missingIndexCheck.unsupportedSearch) {
      const unsupportedConnectionLabel = missingIndexCheck.unsupportedConnections
        .map((entry) => entry.name)
        .join(', ');

      res.status(409).json({
        success: false,
        code: 'search_not_supported',
        error: `This benchmark requires Redis Search/Query Engine support, but ${unsupportedConnectionLabel} does not expose FT.SEARCH. Redis Flex databases without Search support cannot run search presets.`,
        missingIndexes: missingIndexCheck.missingIndexes,
        unsupportedConnections: missingIndexCheck.unsupportedConnections,
      });
      return;
    }

    const missingIndexLabel = missingIndexCheck.missingIndexes.join(', ');
    const missingConnectionLabel = missingIndexCheck.missingConnections
      .map((entry) => entry.name)
      .join(', ');

    res.status(409).json({
      success: false,
      code: 'missing_required_index',
      error: `This benchmark requires ${missingIndexLabel}. Load the matching dataset preset before tuning it on ${missingConnectionLabel}.`,
      missingIndexes: missingIndexCheck.missingIndexes,
      missingConnections: missingIndexCheck.missingConnections,
    });
    return;
  }

  let runtime;
  try {
    runtime = await resolveMemtierRuntime();
  } catch (error) {
    res.status(503).json({
      success: false,
      error: error.message,
    });
    return;
  }

  try {
    await assertRuntimeSupportsScenario(runtime, scenario);
  } catch (error) {
    res.status(409).json({
      success: false,
      error: error.message,
    });
    return;
  }

  const runs = await Promise.all(connections.map(async (connection) => {
    const runId = randomUUID();
    const { command, args, displayCommand, runtime: runtimeDetails } = await buildMemtierCommand({
      runLabel: runId,
      runtime,
      scenario,
      target: connection.target,
    });

    const run = createRun({
      id: runId,
      label: runId,
      displayName: req.body?.name ?? null,
      scenario,
      connection,
      command: displayCommand,
    });

    appendLog(runId, {
      stream: 'meta',
      text: `Runner: ${runtimeDetails.label}`,
    });
    appendLog(runId, {
      stream: 'meta',
      text: `Target: ${connection.name} (${connection.target.summary})`,
    });
    appendLog(runId, {
      stream: 'meta',
      text: `Launching ${displayCommand}`,
    });

    broadcast({
      type: 'run_started',
      run: serializeRun(run),
    });

    let settled = false;
    let child = null;
    let fatalAbortMessage = null;
    const settle = ({ status, exitCode = null, error = null }) => {
      if (settled) {
        return;
      }

      settled = true;
      const completedRun = finishRun(runId, { status, exitCode, error });
      if (completedRun) {
        broadcast({
          type: 'run_finished',
          run: serializeRun(completedRun),
        });
      }
    };

    child = launchMemtier({
      command,
      args,
      onLine: ({ stream, text }) => {
        const entry = appendLog(runId, { stream, text });
        if (stream === 'stdout') {
          recordSummaryLine(runId, text);
        }
        if (stream === 'stderr' && !fatalAbortMessage) {
          recordMemtierProgressLine(runId, text);
        }
        if (entry) {
          broadcast({
            type: 'log',
            runId,
            entry,
          });
        }

        if (stream === 'stderr' && !fatalAbortMessage) {
          const classifiedError = classifyFatalMemtierLine(text);
          if (classifiedError) {
            fatalAbortMessage = classifiedError;

            const abortEntry = appendLog(runId, {
              stream: 'meta',
              text: `Failing fast: ${classifiedError}`,
            });

            if (abortEntry) {
              broadcast({
                type: 'log',
                runId,
                entry: abortEntry,
              });
            }

            settle({
              status: 'failed',
              error: classifiedError,
            });

            if (child && !child.killed) {
              child.kill('SIGTERM');
              setTimeout(() => {
                if (!child.killed) {
                  child.kill('SIGKILL');
                }
              }, 1000).unref();
            }
          }
        }
      },
      onError: (error) => {
        appendLog(runId, {
          stream: 'stderr',
          text: error.message,
        });
        settle({
          status: 'failed',
          error: `Unable to start memtier_benchmark. ${error.message}`,
        });
      },
      onExit: ({ code, signal }) => {
        runningMemtierChildren.delete(runId);

        if (fatalAbortMessage) {
          settle({
            status: 'failed',
            exitCode: code,
            error: fatalAbortMessage,
          });
          return;
        }

        if (code === 0) {
          settle({ status: 'completed', exitCode: 0 });
          return;
        }

        const error = signal
          ? `memtier_benchmark exited with signal ${signal}.`
          : `memtier_benchmark exited with code ${code}.`;

        settle({
          status: 'failed',
          exitCode: code,
          error,
        });
      },
    });

    runningMemtierChildren.set(runId, child);

    return serializeRun(run);
  }));

  res.status(202).json({
    success: true,
    runIds: runs.map((run) => run.id),
    runs,
  });
});

app.post('/api/run/cancel', async (_req, res) => {
  const runningRuns = getRunningRuns();

  if (!runningRuns.length) {
    res.json({
      success: true,
      canceledRunIds: [],
      state: toPublicState(),
    });
    return;
  }

  const runIds = runningRuns.map((run) => run.id);
  const runningChildren = runIds
    .map((runId) => runningMemtierChildren.get(runId))
    .filter(Boolean);

  removeRuns(runIds);
  broadcastState();

  await Promise.all(runningChildren.map((child) => terminateChildProcess(child)));

  res.json({
    success: true,
    canceledRunIds: runIds,
    state: toPublicState(),
  });
});

app.get('/api/run/:id', (req, res) => {
  const run = getRun(req.params.id);

  if (!run) {
    res.status(404).json({
      success: false,
      error: 'Run not found.',
    });
    return;
  }

  res.json({
    success: true,
    run: serializeRun(run),
  });
});

app.use('/api', (_req, res) => {
  res.status(404).json({
    success: false,
    error: 'API route not found.',
  });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distRoot));

  app.use((_req, res) => {
    res.sendFile(path.join(distRoot, 'index.html'));
  });
}

wss.on('connection', (socket) => {
  sendSnapshot(socket);
  socket.send(
    JSON.stringify({
      type: 'setup_state',
      setup: setupManager.getSnapshot(),
    }),
  );
});

server.on('upgrade', (request, socket, head) => {
  if (
    REDISINSIGHT_CONFIG.apiUrl &&
    REDISINSIGHT_CONFIG.publicPath &&
    request.url?.startsWith(`${REDISINSIGHT_CONFIG.publicPath}/socket.io`)
  ) {
    const targetUrl = new URL(REDISINSIGHT_CONFIG.apiUrl);
    const upstreamProtocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const upstreamUrl = `${upstreamProtocol}//${targetUrl.host}${request.url}`;
    const upstreamSocket = new WebSocket(upstreamUrl, {
      headers: {
        ...request.headers,
        host: targetUrl.host,
      },
    });

    redisInsightProxyWss.handleUpgrade(request, socket, head, (clientSocket) => {
      const pendingMessages = [];

      clientSocket.on('message', (data, isBinary) => {
        if (upstreamSocket.readyState === WebSocket.OPEN) {
          upstreamSocket.send(data, { binary: isBinary });
          return;
        }

        pendingMessages.push({ data, isBinary });
      });

      clientSocket.on('close', (code, reason) => {
        if (upstreamSocket.readyState === WebSocket.OPEN) {
          upstreamSocket.close(code, reason);
        }
      });

      clientSocket.on('error', () => {
        if (upstreamSocket.readyState === WebSocket.OPEN) {
          upstreamSocket.close();
        }
      });

      upstreamSocket.on('open', () => {
        while (pendingMessages.length) {
          const entry = pendingMessages.shift();
          upstreamSocket.send(entry.data, { binary: entry.isBinary });
        }
      });

      upstreamSocket.on('message', (data, isBinary) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(data, { binary: isBinary });
        }
      });

      upstreamSocket.on('close', (code, reason) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.close(code, reason.toString());
        }
      });

      upstreamSocket.on('error', () => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.close();
        }
      });
    });

    return;
  }

  if (request.url !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (client) => {
    wss.emit('connection', client, request);
  });
});

createStatsdReceiver({
  host: STATSD_HOST,
  port: STATSD_PORT,
  onMetric: (metricUpdate) => {
    const run = recordMetric(metricUpdate.runLabel, metricUpdate);
    if (!run) {
      return;
    }

    broadcast({
      type: 'metric',
      runId: metricUpdate.runLabel,
      metric: metricUpdate.metric,
      value: metricUpdate.value,
      metrics: run.metrics,
      series: run.series,
      timestamp: metricUpdate.timestamp,
    });
  },
  onError: (error) => {
    console.error(`StatsD listener error on ${STATSD_HOST}:${STATSD_PORT}: ${error.message}`);
    const runningRuns = getRunningRuns();
    if (!runningRuns.length) {
      return;
    }

    for (const run of runningRuns) {
      const entry = appendLog(run.id, {
        stream: 'stderr',
        text: `StatsD listener error: ${error.message}`,
      });

      if (entry) {
        broadcast({
          type: 'log',
          runId: run.id,
          entry,
        });
      }
    }
  },
});

await initializePresetLibrary();

server.listen(APP_PORT, () => {
  console.log(`memviz server listening on ${APP_URL}`);
  setupManager.start().catch((error) => {
    console.error(`memviz setup failed: ${error.message}`);
  });
});
