function asFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasStaircaseProfile(config = {}) {
  return Boolean(config?.staircaseEnabled);
}

export function formatLoadProfileSummary(config = {}) {
  const targetClients = asFiniteNumber(config?.clients);
  if (!hasStaircaseProfile(config)) {
    return targetClients ? `flat ${targetClients} clients/thread` : 'flat load';
  }

  const startClients = asFiniteNumber(config?.clientsStart);
  const clientStep = asFiniteNumber(config?.clientsStep);
  const stepDuration = asFiniteNumber(config?.stepDuration);

  if (!startClients || !clientStep || !stepDuration || !targetClients) {
    return 'staircase load';
  }

  return `staircase ${startClients}\u2192${targetClients} clients/thread (+${clientStep} every ${stepDuration}s)`;
}

export function estimateAverageActiveClientsPerThread(config = {}) {
  if (!hasStaircaseProfile(config)) {
    return asFiniteNumber(config?.clients);
  }

  const targetClients = asFiniteNumber(config?.clients);
  const startClients = asFiniteNumber(config?.clientsStart);
  const clientStep = asFiniteNumber(config?.clientsStep);
  const stepDuration = asFiniteNumber(config?.stepDuration);
  const totalDuration = asFiniteNumber(config?.testTime);

  if (
    !targetClients ||
    !startClients ||
    !clientStep ||
    !stepDuration ||
    !totalDuration ||
    targetClients <= 0 ||
    startClients <= 0 ||
    clientStep <= 0 ||
    stepDuration <= 0 ||
    totalDuration <= 0
  ) {
    return null;
  }

  let remainingSeconds = totalDuration;
  let activeClients = Math.min(startClients, targetClients);
  let weightedClients = 0;

  while (remainingSeconds > 0) {
    const segmentDuration = Math.min(stepDuration, remainingSeconds);
    weightedClients += activeClients * segmentDuration;
    remainingSeconds -= segmentDuration;

    if (remainingSeconds > 0) {
      activeClients = Math.min(targetClients, activeClients + clientStep);
    }
  }

  return weightedClients / totalDuration;
}

export function estimateStaircaseThroughput(throughput, config = {}) {
  const numericThroughput = asFiniteNumber(throughput);
  if (!hasStaircaseProfile(config)) {
    return numericThroughput;
  }

  const targetClients = asFiniteNumber(config?.clients);
  const averageClients = estimateAverageActiveClientsPerThread(config);
  if (!numericThroughput || !targetClients || !averageClients || targetClients <= 0) {
    return null;
  }

  return numericThroughput * (averageClients / targetClients);
}

export function getRampStepCount(config = {}) {
  if (!hasStaircaseProfile(config)) {
    return 0;
  }

  const targetClients = asFiniteNumber(config?.clients);
  const startClients = asFiniteNumber(config?.clientsStart);
  const clientStep = asFiniteNumber(config?.clientsStep);

  if (!targetClients || !startClients || !clientStep || targetClients <= startClients) {
    return 0;
  }

  return Math.ceil((targetClients - startClients) / clientStep);
}

export function getMinimumRampDurationSeconds(config = {}) {
  if (!hasStaircaseProfile(config)) {
    return 0;
  }

  const stepDuration = asFiniteNumber(config?.stepDuration);
  const stepCount = getRampStepCount(config);
  if (!stepDuration || stepCount <= 0) {
    return 0;
  }

  return stepCount * stepDuration;
}

export function getReachedClientsPerThreadAtTime(config = {}, durationSeconds) {
  const targetClients = asFiniteNumber(config?.clients);
  if (!hasStaircaseProfile(config)) {
    return targetClients;
  }

  const startClients = asFiniteNumber(config?.clientsStart);
  const clientStep = asFiniteNumber(config?.clientsStep);
  const stepDuration = asFiniteNumber(config?.stepDuration);
  const elapsedSeconds = asFiniteNumber(durationSeconds);

  if (
    !targetClients ||
    !startClients ||
    !clientStep ||
    !stepDuration ||
    elapsedSeconds === null ||
    elapsedSeconds < 0
  ) {
    return null;
  }

  const completedSteps = Math.floor(elapsedSeconds / stepDuration);
  return Math.min(targetClients, startClients + completedSteps * clientStep);
}
