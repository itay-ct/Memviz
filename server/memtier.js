import { spawn } from 'node:child_process';

import { buildMemtierConnectionArgs, buildRedisUrl } from './redis-target.js';

const DOCKER_IMAGE = 'redislabs/memtier_benchmark:latest';
export const MEMTIER_REPO_URL = 'https://github.com/RedisLabs/memtier_benchmark';
export const MIN_MEMTIER_VERSION = '2.3.0';

export const STATSD_PORT = Number(
  process.env.MEMVIZ_STATSD_PORT ?? process.env.MEMTIERVIZ_STATSD_PORT ?? 8125,
);
export const STATSD_PREFIX = 'memviz';
export const STATSD_HOST =
  process.env.MEMVIZ_STATSD_HOST ?? process.env.MEMTIERVIZ_STATSD_HOST ?? '127.0.0.1';

let runtimePromise;
let localVersionPromise;
let dockerVersionPromise;

function compareVersions(left, right) {
  const leftParts = String(left ?? '0')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right ?? '0')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function isVersionSupported(version) {
  if (!version) {
    return false;
  }

  return compareVersions(version, MIN_MEMTIER_VERSION) >= 0;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildDisplayArgs(target) {
  if (!target.hasAuth && !target.tls && (target.db ?? 0) === 0) {
    return ['--host', target.host, '--port', String(target.port)];
  }

  return ['--uri', buildRedisUrl(target, { redactPassword: true })];
}

function buildInnerMemtierArgs({ runLabel, scenario, statsdHost, target }) {
  return [
    '--protocol',
    'redis',
    ...buildMemtierConnectionArgs(target),
    '--statsd-host',
    statsdHost,
    '--statsd-port',
    String(STATSD_PORT),
    '--statsd-prefix',
    STATSD_PREFIX,
    '--statsd-run-label',
    runLabel,
    ...scenario.memtierArgs,
  ];
}

function buildPingProbeArgs(target) {
  return [
    '--protocol',
    'redis',
    ...buildMemtierConnectionArgs(target),
    '--clients',
    '1',
    '--threads',
    '1',
    '--test-time',
    '2',
    '--hide-histogram',
    '--command',
    'PING',
    '--command-ratio',
    '1',
  ];
}

function isLoopbackHost(host) {
  return ['127.0.0.1', 'localhost', '::1'].includes(host.toLowerCase());
}

function getDockerHostFlags() {
  return process.platform === 'linux'
    ? ['--add-host', 'host.docker.internal:host-gateway']
    : [];
}

function toDockerReachableTarget(target) {
  return {
    ...target,
    host: isLoopbackHost(target.host) ? 'host.docker.internal' : target.host,
    summary: isLoopbackHost(target.host)
      ? `host.docker.internal:${target.port}`
      : target.summary,
  };
}

function buildLocalCommand({ runLabel, scenario, target }) {
  const args = buildInnerMemtierArgs({
    runLabel,
    scenario,
    statsdHost: STATSD_HOST,
    target,
  });

  const displayArgs = [
    ...buildDisplayArgs(target),
    '--statsd-host',
    STATSD_HOST,
    '--statsd-port',
    String(STATSD_PORT),
    '--statsd-prefix',
    STATSD_PREFIX,
    '--statsd-run-label',
    runLabel,
    ...scenario.memtierArgs,
  ];

  return {
    runtime: {
      kind: 'local',
      label: 'local memtier_benchmark',
    },
    command: 'memtier_benchmark',
    args,
    displayCommand: `memtier_benchmark ${displayArgs
      .map((arg) => shellQuote(arg))
      .join(' ')}`,
  };
}

function buildDockerCommand({ runLabel, scenario, target }) {
  const dockerTarget = toDockerReachableTarget(target);
  const containerArgs = buildInnerMemtierArgs({
    runLabel,
    scenario,
    statsdHost: 'host.docker.internal',
    target: dockerTarget,
  });

  const displayContainerArgs = [
    ...buildDisplayArgs(dockerTarget),
    '--statsd-host',
    'host.docker.internal',
    '--statsd-port',
    String(STATSD_PORT),
    '--statsd-prefix',
    STATSD_PREFIX,
    '--statsd-run-label',
    runLabel,
    ...scenario.memtierArgs,
  ];

  const args = ['run', '--rm', ...getDockerHostFlags(), DOCKER_IMAGE, ...containerArgs];
  const displayArgs = [
    'run',
    '--rm',
    ...getDockerHostFlags(),
    DOCKER_IMAGE,
    ...displayContainerArgs,
  ];

  return {
    runtime: {
      kind: 'docker',
      label: `Docker fallback (${DOCKER_IMAGE})`,
    },
    command: 'docker',
    args,
    displayCommand: `docker ${displayArgs.map((arg) => shellQuote(arg)).join(' ')}`,
  };
}

function buildLocalPingProbeCommand(target) {
  const args = buildPingProbeArgs(target);

  return {
    command: 'memtier_benchmark',
    args,
  };
}

function buildDockerPingProbeCommand(target) {
  const dockerTarget = toDockerReachableTarget(target);
  const containerArgs = buildPingProbeArgs(dockerTarget);

  return {
    command: 'docker',
    args: ['run', '--rm', ...getDockerHostFlags(), DOCKER_IMAGE, ...containerArgs],
  };
}

function parseProbeAverageLatency(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!/^Totals\s+/i.test(line)) {
      continue;
    }

    const parts = line.split(/\s{2,}/);
    if (parts.length < 3) {
      continue;
    }

    const averageLatency = Number(parts[2]);
    if (Number.isFinite(averageLatency)) {
      return averageLatency;
    }
  }

  return null;
}

function captureProcessOutput(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        output: `${stdout}\n${stderr}`.trim(),
      });
    });
  });
}

async function localRuntimeSupportsStatsd() {
  try {
    const { output } = await captureProcessOutput('memtier_benchmark', ['--help']);
    return output.includes('--statsd-host');
  } catch {
    return false;
  }
}

async function dockerRuntimeSupportsStatsd() {
  try {
    const { output } = await captureProcessOutput('docker', [
      'run',
      '--rm',
      ...getDockerHostFlags(),
      DOCKER_IMAGE,
      '--help',
    ]);

    return output.includes('--statsd-host');
  } catch {
    return false;
  }
}

function extractMemtierVersion(output) {
  const match = output.match(/memtier_benchmark\s+v=([^\s]+)/i);
  return match?.[1] ?? null;
}

async function getLocalRuntimeVersion() {
  if (!localVersionPromise) {
    localVersionPromise = captureProcessOutput('memtier_benchmark', ['--version'])
      .then(({ output }) => extractMemtierVersion(output))
      .catch(() => null);
  }

  return localVersionPromise;
}

async function getDockerRuntimeVersion() {
  if (!dockerVersionPromise) {
    dockerVersionPromise = captureProcessOutput('docker', [
      'run',
      '--rm',
      ...getDockerHostFlags(),
      DOCKER_IMAGE,
      '--version',
    ])
      .then(({ output }) => extractMemtierVersion(output))
      .catch(() => null);
  }

  return dockerVersionPromise;
}

export async function inspectLocalRuntime() {
  const version = await getLocalRuntimeVersion();
  const statsdSupported = await localRuntimeSupportsStatsd();

  return {
    kind: 'local',
    available: Boolean(version || statsdSupported),
    version,
    statsdSupported,
    meetsMinimum: isVersionSupported(version),
  };
}

export async function inspectDockerAvailability() {
  try {
    const { output } = await captureProcessOutput('docker', ['--version']);
    return {
      available: true,
      detail: output,
    };
  } catch (error) {
    return {
      available: false,
      detail: error.message,
    };
  }
}

export async function inspectDockerRuntime() {
  const availability = await inspectDockerAvailability();
  if (!availability.available) {
    return {
      kind: 'docker',
      available: false,
      version: null,
      statsdSupported: false,
      meetsMinimum: false,
      detail: availability.detail,
    };
  }

  const version = await getDockerRuntimeVersion();
  const statsdSupported = await dockerRuntimeSupportsStatsd();

  return {
    kind: 'docker',
    available: Boolean(version || statsdSupported),
    version,
    statsdSupported,
    meetsMinimum: isVersionSupported(version),
    detail: availability.detail,
  };
}

export function rememberResolvedRuntime(kind) {
  runtimePromise = Promise.resolve({ kind });
}

export function resetRuntimeResolution() {
  runtimePromise = undefined;
  localVersionPromise = undefined;
  dockerVersionPromise = undefined;
}

export function pullDockerImage({ onLine }) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['pull', DOCKER_IMAGE], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    wireStream(child.stdout, 'stdout', ({ text }) => {
      onLine?.(text);
    });
    wireStream(child.stderr, 'stderr', ({ text }) => {
      onLine?.(text);
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`docker pull exited with code ${code}.`));
    });
  });
}

export async function resolveMemtierRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const localRuntime = await inspectLocalRuntime();
      if (localRuntime.available && localRuntime.meetsMinimum && localRuntime.statsdSupported) {
        return { kind: 'local' };
      }

      const dockerRuntime = await inspectDockerRuntime();
      if (dockerRuntime.available && dockerRuntime.meetsMinimum && dockerRuntime.statsdSupported) {
        return { kind: 'docker' };
      }

      throw new Error(
        `No supported Memtier runtime is available. Install memtier_benchmark ${MIN_MEMTIER_VERSION} or newer with StatsD support, or make Docker available.`,
      );
    })();
  }

  return runtimePromise;
}

export async function resolveMemtierMetadata() {
  const runtime = await resolveMemtierRuntime();
  const runtimeDetails = runtime.kind === 'docker'
    ? await inspectDockerRuntime()
    : await inspectLocalRuntime();

  return {
    kind: runtime.kind,
    version: runtimeDetails.version,
    minimumVersion: MIN_MEMTIER_VERSION,
    repoUrl: MEMTIER_REPO_URL,
  };
}

export function buildMemtierCommand({ runLabel, runtime, scenario, target }) {
  if (runtime.kind === 'docker') {
    return buildDockerCommand({ runLabel, scenario, target });
  }

  return buildLocalCommand({ runLabel, scenario, target });
}

export async function measureConnectionLatency({ runtime, target }) {
  const probeCommand = runtime.kind === 'docker'
    ? buildDockerPingProbeCommand(target)
    : buildLocalPingProbeCommand(target);
  const { code, output } = await captureProcessOutput(probeCommand.command, probeCommand.args);

  if (code !== 0) {
    throw new Error(`Latency probe exited with code ${code}.`);
  }

  const averageLatency = parseProbeAverageLatency(output);
  if (!Number.isFinite(averageLatency)) {
    throw new Error('Could not parse latency probe output.');
  }

  return averageLatency;
}

function wireStream(stream, streamName, onLine) {
  let pending = '';

  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n|\r/);
    pending = lines.pop() ?? '';

    for (const line of lines) {
      if (line) {
        onLine({ stream: streamName, text: line });
      }
    }
  });

  stream.on('end', () => {
    if (pending) {
      onLine({ stream: streamName, text: pending });
    }
  });
}

export function launchMemtier({
  command,
  args,
  onLine,
  onError,
  onExit,
}) {
  const child = spawn(command, args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  wireStream(child.stdout, 'stdout', onLine);
  wireStream(child.stderr, 'stderr', onLine);

  child.on('error', onError);
  child.on('exit', (code, signal) => {
    onExit({ code, signal });
  });

  return child;
}
