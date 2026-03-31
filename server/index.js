import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { createClient } from 'redis';
import { WebSocket, WebSocketServer } from 'ws';

import { buildRedisUrl, normalizeRedisTarget } from './redis-target.js';
import { buildRunnableScenario, scenarios, getScenarioById } from './scenarios.js';
import {
  appendLog,
  clearRuns,
  createConnection,
  createRun,
  finishRun,
  getConnection,
  getConnections,
  getRun,
  getRunningRuns,
  getSelectedConnection,
  getStateSnapshot,
  hasRunningRuns,
  recordMetric,
  recordSummaryLine,
  removeConnection,
  renameConnection,
  selectConnection,
  serializeRun,
  updateConnectionRtt,
} from './store.js';
import {
  buildMemtierCommand,
  launchMemtier,
  measureConnectionLatency,
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
const APP_VERSION = '1.0.1';
const APP_PORT = Number(process.env.PORT ?? 3000);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const MAX_CONNECTIONS = 3;
const DEFAULT_TARGET_INPUT = {
  hostOrUrl: '127.0.0.1',
  port: '6379',
  username: 'default',
  password: '',
};
const DEFAULT_TARGET_NAME = '127.0.0.1:6379';
let attemptedDefaultConnectionBootstrap = false;
const rttProbeConnectionIds = new Set();
const FATAL_MEMTIER_PATTERNS = [
  {
    regex: /max number of clients reached/i,
    message: (line) => `Redis refused benchmark connections: ${line}`,
  },
];

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
      state: getStateSnapshot(),
      scenarios,
    }),
  );
}

function broadcastState() {
  broadcast({
    type: 'snapshot',
    state: getStateSnapshot(),
    scenarios,
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

  if (hasRunningRuns()) {
    res.status(409).json({
      success: false,
      error: 'Wait for the current benchmark run to finish before changing targets.',
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

app.post('/api/disconnect', (req, res) => {
  if (hasRunningRuns()) {
    res.status(409).json({
      success: false,
      error: 'Disconnect is disabled while a benchmark is running.',
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

  const runs = connections.map((connection) => {
    const runId = randomUUID();
    const { command, args, displayCommand, runtime: runtimeDetails } = buildMemtierCommand({
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

    return serializeRun(run);
  });

  res.status(202).json({
    success: true,
    runIds: runs.map((run) => run.id),
    runs,
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

server.listen(APP_PORT, () => {
  console.log(`memviz server listening on ${APP_URL}`);
  setupManager.start().catch((error) => {
    console.error(`memviz setup failed: ${error.message}`);
  });
});
