import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { createClient } from 'redis';
import { WebSocket, WebSocketServer } from 'ws';

import { buildRedisUrl, normalizeRedisTarget, serializeConnectionTarget } from './redis-target.js';
import { buildRunnableScenario, scenarios, getScenarioById } from './scenarios.js';
import {
  appendLog,
  clearConnectionTarget,
  clearRuns,
  createRun,
  finishRun,
  getActiveRunId,
  getConnectionTarget,
  getRun,
  getStateSnapshot,
  recordMetric,
  recordSummaryLine,
  serializeRun,
  setConnectionTarget,
} from './store.js';
import {
  buildMemtierCommand,
  launchMemtier,
  MEMTIER_REPO_URL,
  MIN_MEMTIER_VERSION,
  resolveMemtierRuntime,
  STATSD_HOST,
  STATSD_PORT,
} from './memtier.js';
import { createSetupManager } from './setup-manager.js';
import { createStatsdReceiver } from './statsd.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const REDIS_CONNECT_TIMEOUT_MS = 3000;
const APP_VERSION = '1.0.0';
const APP_PORT = Number(process.env.PORT ?? 3000);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;

app.use(express.json());

const setupManager = createSetupManager({
  appPort: APP_PORT,
  appUrl: APP_URL,
  onUpdate: (setup) => {
    broadcast({
      type: 'setup_state',
      setup,
    });
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
      state: getStateSnapshot(),
      scenarios,
    }),
  );
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

function withStatus(res, error) {
  if (error.kind === 'validation') {
    return res.status(400);
  }

  return res.status(502);
}

function toPublicState() {
  return {
    ...getStateSnapshot(),
    scenarios,
  };
}

app.get('/api/state', (_req, res) => {
  res.json(toPublicState());
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

  if (getActiveRunId()) {
    res.status(409).json({
      success: false,
      error: 'Wait for the current benchmark run to finish before changing targets.',
    });
    return;
  }

  try {
    const target = normalizeRedisTarget(req.body);
    await verifyRedisConnection(target);
    setConnectionTarget(target);

    const connection = serializeConnectionTarget(target);
    broadcast({ type: 'connection', connection });

    res.json({ success: true, connection });
  } catch (error) {
    withStatus(res, error).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/disconnect', (_req, res) => {
  if (getActiveRunId()) {
    res.status(409).json({
      success: false,
      error: 'Disconnect is disabled while a benchmark is running.',
    });
    return;
  }

  clearConnectionTarget();
  broadcast({ type: 'disconnected' });
  res.json({ success: true });
});

app.post('/api/clear', (_req, res) => {
  if (getActiveRunId()) {
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
    scenarios,
  });
  res.json({ success: true, state });
});

app.post('/api/run', async (req, res) => {
  if (!setupManager.isReady()) {
    res.status(409).json({
      success: false,
      error: 'Complete the memviz setup before starting a benchmark.',
    });
    return;
  }

  const target = getConnectionTarget();
  if (!target) {
    res.status(409).json({
      success: false,
      error: 'Connect to Redis before starting a benchmark.',
    });
    return;
  }

  if (getActiveRunId()) {
    res.status(409).json({
      success: false,
      error: 'Only one benchmark run can be active at a time.',
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

  const runId = randomUUID();
  const { command, args, displayCommand, runtime: runtimeDetails } = buildMemtierCommand({
    runLabel: runId,
    runtime,
    scenario,
    target,
  });

  const run = createRun({
    id: runId,
    label: runId,
    displayName: req.body?.name ?? null,
    scenario,
    target,
    command: displayCommand,
  });

  appendLog(runId, {
    stream: 'meta',
    text: `Runner: ${runtimeDetails.label}`,
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

  launchMemtier({
    command,
    args,
    onLine: ({ stream, text }) => {
      const entry = appendLog(runId, { stream, text });
      if (stream === 'stdout') {
        recordSummaryLine(runId, text);
      }
      if (entry) {
        broadcast({
          type: 'log',
          runId,
          entry,
        });
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

  res.status(202).json({
    success: true,
    runId,
    run: serializeRun(run),
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
    const activeRunId = getActiveRunId();
    if (!activeRunId) {
      return;
    }

    const entry = appendLog(activeRunId, {
      stream: 'stderr',
      text: `StatsD listener error: ${error.message}`,
    });

    if (entry) {
      broadcast({
        type: 'log',
        runId: activeRunId,
        entry,
      });
    }
  },
});

server.listen(APP_PORT, () => {
  console.log(`memviz server listening on ${APP_URL}`);
  setupManager.start().catch((error) => {
    console.error(`memviz setup failed: ${error.message}`);
  });
});
