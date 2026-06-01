import {
  getMinimumRampDurationSeconds,
  hasStaircaseProfile,
} from '../shared/scenario-load-profile.js';

function clampValue(nextValue, limits) {
  const numericValue = Number(nextValue);
  if (!Number.isFinite(numericValue)) {
    return limits.min;
  }

  return Math.min(limits.max, Math.max(limits.min, numericValue));
}

export function applyScenarioDraftConfigChange(config, scenario, field, nextValue) {
  if (field === 'limitMode') {
    return {
      ...config,
      limitMode: nextValue,
      staircaseEnabled: nextValue === 'time' ? config.staircaseEnabled : false,
    };
  }

  if (
    field === 'rateLimitEnabled' ||
    field === 'clusterModeEnabled' ||
    field === 'command' ||
    field === 'keyPrefix' ||
    field === 'memtierAdvanced'
  ) {
    return {
      ...config,
      [field]: nextValue,
    };
  }

  if (field === 'staircaseEnabled') {
    if (config.clients <= 1) {
      return {
        ...config,
        staircaseEnabled: false,
      };
    }

    const defaultStartClients = Math.max(
      1,
      Math.min(
        config.clients - 1,
        config.clientsStart ?? scenario?.defaults?.clientsStart ?? 1,
      ),
    );

    const nextConfig = {
      ...config,
      staircaseEnabled: Boolean(nextValue) && config.limitMode === 'time',
      clientsStart: defaultStartClients,
      clientsStep: config.clientsStep ?? scenario?.defaults?.clientsStep ?? 1,
      stepDuration: config.stepDuration ?? scenario?.defaults?.stepDuration ?? 5,
    };

    if (nextConfig.staircaseEnabled) {
      const minimumRampDurationSeconds = getMinimumRampDurationSeconds(nextConfig);
      if (minimumRampDurationSeconds > 0 && nextConfig.testTime < minimumRampDurationSeconds) {
        nextConfig.testTime = minimumRampDurationSeconds;
      }
    }

    return nextConfig;
  }

  const limits = scenario?.limits?.[field];
  if (!limits) {
    return config;
  }

  const clampedValue = clampValue(nextValue, limits);
  const nextConfig = {
    ...config,
    [field]: clampedValue,
  };

  if (field === 'clients' && hasStaircaseProfile(nextConfig) && nextConfig.clientsStart >= clampedValue) {
    if (clampedValue <= 1) {
      nextConfig.staircaseEnabled = false;
    } else {
      nextConfig.clientsStart = Math.max(1, clampedValue - 1);
    }
  }

  return nextConfig;
}
