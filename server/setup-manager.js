import {
  MEMTIER_REPO_URL,
  MIN_MEMTIER_VERSION,
  inspectDockerAvailability,
  inspectDockerRuntime,
  inspectLocalRuntime,
  pullDockerImage,
  rememberResolvedRuntime,
  resetRuntimeResolution,
} from './memtier.js';

const MAX_SETUP_LOGS = 120;

function createSteps() {
  return [
    {
      id: 'local',
      label: 'Check local memtier_benchmark',
      status: 'pending',
      detail: '',
    },
    {
      id: 'docker',
      label: 'Prepare Docker fallback',
      status: 'pending',
      detail: '',
    },
    {
      id: 'verify',
      label: 'Verify benchmark runtime',
      status: 'pending',
      detail: '',
    },
  ];
}

function createInitialState({ appPort, appUrl }) {
  return {
    status: 'idle',
    progress: 0,
    message: 'Waiting to prepare memtier.',
    error: null,
    runtimeKind: null,
    version: null,
    minimumVersion: MIN_MEMTIER_VERSION,
    repoUrl: MEMTIER_REPO_URL,
    appPort,
    appUrl,
    steps: createSteps(),
    logs: [],
  };
}

function formatLocalFallbackDetail(localRuntime) {
  if (!localRuntime.available) {
    return 'No local memtier_benchmark was found.';
  }

  if (!localRuntime.version) {
    return 'Local memtier_benchmark version could not be detected.';
  }

  if (!localRuntime.meetsMinimum) {
    return `Found ${localRuntime.version}; need ${MIN_MEMTIER_VERSION} or newer.`;
  }

  if (!localRuntime.statsdSupported) {
    return `Found ${localRuntime.version}, but it does not expose StatsD support.`;
  }

  return `Using local memtier_benchmark ${localRuntime.version}.`;
}

export function createSetupManager({ appPort, appUrl, onUpdate }) {
  let state = createInitialState({ appPort, appUrl });
  let setupPromise = null;

  function getSnapshot() {
    return {
      ...state,
      steps: state.steps.map((step) => ({ ...step })),
      logs: state.logs.map((entry) => ({ ...entry })),
    };
  }

  function emitUpdate() {
    onUpdate?.(getSnapshot());
  }

  function setState(patch) {
    state = {
      ...state,
      ...patch,
    };
    emitUpdate();
  }

  function setStep(id, patch) {
    state = {
      ...state,
      steps: state.steps.map((step) =>
        step.id === id
          ? {
              ...step,
              ...patch,
            }
          : step),
    };
    emitUpdate();
  }

  function pushLog(text) {
    state = {
      ...state,
      logs: [
        ...state.logs,
        {
          timestamp: new Date().toISOString(),
          text,
        },
      ].slice(-MAX_SETUP_LOGS),
    };
    emitUpdate();
  }

  function nudgeProgress(target) {
    if (state.progress >= target) {
      return;
    }

    state = {
      ...state,
      progress: Math.min(target, state.progress + 2),
    };
    emitUpdate();
  }

  async function runSetup() {
    resetRuntimeResolution();
    setState({
      status: 'running',
      progress: 6,
      message: 'Checking local memtier_benchmark.',
      error: null,
      runtimeKind: null,
      version: null,
      steps: createSteps(),
      logs: [],
    });
    pushLog(`Setup started. memviz needs memtier_benchmark ${MIN_MEMTIER_VERSION} or newer.`);

    setStep('local', { status: 'running' });
    const localRuntime = await inspectLocalRuntime();
    if (localRuntime.available) {
      pushLog(`Local memtier_benchmark ${localRuntime.version ?? 'unknown'} detected.`);
    } else {
      pushLog('Local memtier_benchmark was not detected.');
    }

    if (localRuntime.available && localRuntime.meetsMinimum && localRuntime.statsdSupported) {
      setStep('local', {
        status: 'completed',
        detail: `Using local memtier_benchmark ${localRuntime.version}.`,
      });
      setStep('docker', {
        status: 'skipped',
        detail: 'Docker fallback not needed.',
      });
      setStep('verify', {
        status: 'completed',
        detail: `Ready on local runtime (${localRuntime.version}).`,
      });
      rememberResolvedRuntime('local');
      setState({
        status: 'ready',
        progress: 100,
        message: `Ready on ${appUrl}`,
        runtimeKind: 'local',
        version: localRuntime.version,
      });
      pushLog(`Setup complete. memviz is running on ${appUrl}.`);
      return;
    }

    setStep('local', {
      status: localRuntime.available ? 'completed' : 'skipped',
      detail: formatLocalFallbackDetail(localRuntime),
    });

    setStep('docker', { status: 'running' });
    setState({
      progress: 34,
      message: 'Preparing Docker fallback.',
    });
    const dockerAvailability = await inspectDockerAvailability();
    if (!dockerAvailability.available) {
      setStep('docker', {
        status: 'failed',
        detail: 'Docker is not available.',
      });
      setStep('verify', {
        status: 'skipped',
        detail: 'Setup could not continue.',
      });
      pushLog(dockerAvailability.detail || 'Docker is not available.');
      setState({
        status: 'error',
        progress: 100,
        message: 'Setup failed.',
        error:
          `No compatible local memtier_benchmark was found, and Docker is not available. ` +
          `Install memtier_benchmark ${MIN_MEMTIER_VERSION}+ with StatsD support, or install Docker.`,
      });
      return;
    }

    pushLog(`Pulling ${'redislabs/memtier_benchmark:latest'} from Docker.`);
    try {
      await pullDockerImage({
        onLine: (line) => {
          if (!line) {
            return;
          }

          nudgeProgress(72);
          pushLog(line);
        },
      });
    } catch (error) {
      setStep('docker', {
        status: 'failed',
        detail: 'Docker pull failed.',
      });
      setStep('verify', {
        status: 'skipped',
        detail: 'Setup could not continue.',
      });
      pushLog(error.message);
      setState({
        status: 'error',
        progress: 100,
        message: 'Setup failed.',
        error: `Docker could not pull the official memtier image. ${error.message}`,
      });
      return;
    }

    setStep('docker', {
      status: 'completed',
      detail: 'Docker image is ready.',
    });
    setStep('verify', { status: 'running' });
    setState({
      progress: 82,
      message: 'Verifying docker memtier runtime.',
    });

    const dockerRuntime = await inspectDockerRuntime();
    if (!dockerRuntime.available || !dockerRuntime.version || !dockerRuntime.meetsMinimum || !dockerRuntime.statsdSupported) {
      const verifyDetail = dockerRuntime.version
        ? `Found docker memtier ${dockerRuntime.version}, but it is not compatible.`
        : 'Could not verify docker memtier.';
      setStep('verify', {
        status: 'failed',
        detail: verifyDetail,
      });
      pushLog(verifyDetail);
      setState({
        status: 'error',
        progress: 100,
        message: 'Setup failed.',
        runtimeKind: 'docker',
        version: dockerRuntime.version,
        error:
          `The Docker memtier runtime is not compatible. memviz needs memtier_benchmark ` +
          `${MIN_MEMTIER_VERSION}+ with StatsD support.`,
      });
      return;
    }

    rememberResolvedRuntime('docker');
    setStep('verify', {
      status: 'completed',
      detail: `Using Docker memtier ${dockerRuntime.version}.`,
    });
    setState({
      status: 'ready',
      progress: 100,
      message: `Ready on ${appUrl}`,
      runtimeKind: 'docker',
      version: dockerRuntime.version,
      error: null,
    });
    pushLog(`Setup complete. Using Docker memtier ${dockerRuntime.version}. memviz is running on ${appUrl}.`);
  }

  return {
    getSnapshot,
    isReady() {
      return state.status === 'ready';
    },
    async start({ force = false } = {}) {
      if (setupPromise && !force) {
        return setupPromise;
      }

      if (force) {
        setupPromise = null;
      }

      if (!force && state.status === 'ready') {
        return state;
      }

      setupPromise = runSetup().finally(() => {
        setupPromise = null;
      });
      return setupPromise;
    },
  };
}
