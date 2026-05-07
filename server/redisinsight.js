import http from 'node:http';
import https from 'node:https';

import { buildRedisInsightUrl } from './redis-target.js';

const DEFAULT_PUBLIC_PATH = '/redisinsight';

function trimTrailingSlash(value = '') {
  return String(value).replace(/\/+$/, '');
}

function ensureLeadingSlash(value = '') {
  return value.startsWith('/') ? value : `/${value}`;
}

function normalizeRedisInsightPublicUrl(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimTrailingSlash(trimmed);
  }

  return trimTrailingSlash(ensureLeadingSlash(trimmed));
}

function normalizeRedisInsightApiUrl(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return trimTrailingSlash(parsed.toString());
  } catch {
    throw new Error('REDISINSIGHT_API_URL must be a valid absolute URL.');
  }
}

function getPublicUrlPath(publicUrl) {
  if (!publicUrl) {
    return '';
  }

  if (/^https?:\/\//i.test(publicUrl)) {
    return trimTrailingSlash(new URL(publicUrl).pathname || '');
  }

  return trimTrailingSlash(ensureLeadingSlash(publicUrl));
}

export function getRedisInsightConfig(env = process.env) {
  const publicUrl = normalizeRedisInsightPublicUrl(
    env.REDISINSIGHT_PUBLIC_URL || env.REDISINSIGHT_PROXY_PATH || '',
  );
  const apiUrl = normalizeRedisInsightApiUrl(env.REDISINSIGHT_API_URL || '');
  const publicPath =
    publicUrl && !/^https?:\/\//i.test(publicUrl)
      ? ensureLeadingSlash(publicUrl)
      : null;

  return {
    apiUrl,
    publicUrl,
    publicPath,
    webConfigured: Boolean(apiUrl && publicUrl),
  };
}

function normalizeDbNumber(value) {
  return Number.isInteger(value) ? value : Number(value) || 0;
}

export function buildRedisInsightDatabasePayload(target, { databaseAlias } = {}) {
  return {
    host: target.host,
    port: target.port,
    db: normalizeDbNumber(target.db),
    name: databaseAlias || target.summary,
    username: target.username || 'default',
    password: target.password ?? '',
    tls: Boolean(target.tls),
  };
}

export function databaseMatchesTarget(database, target) {
  if (!database || !target) {
    return false;
  }

  return (
    String(database.host ?? '') === String(target.host ?? '') &&
    Number(database.port ?? 0) === Number(target.port ?? 0) &&
    normalizeDbNumber(database.db) === normalizeDbNumber(target.db)
  );
}

function createRequestError(message, cause) {
  const error = new Error(message);
  error.kind = 'redisinsight';
  error.cause = cause;
  return error;
}

async function parseRedisInsightResponse(response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestRedisInsight(fetchImpl, apiUrl, pathname, options = {}) {
  const response = await fetchImpl(`${apiUrl}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const payload = await parseRedisInsightResponse(response);

  if (!response.ok) {
    const errorMessage =
      payload?.message ||
      payload?.error ||
      payload?.statusCode ||
      `${response.status} ${response.statusText}`;
    throw createRequestError(`RedisInsight request failed: ${errorMessage}`);
  }

  return payload;
}

function buildRedisInsightBrowserUrl(publicUrl, databaseId) {
  return `${trimTrailingSlash(publicUrl)}/${databaseId}/browser`;
}

function buildRedisInsightApiBasePath(config) {
  return `${config.apiPathPrefix}/api`;
}

function shouldStoreSensitiveCredentials(target) {
  return Boolean(target?.password);
}

function hasInitializedCredentialStorage(settings) {
  return typeof settings?.agreements?.encryption === 'boolean';
}

export function createRedisInsightService({
  apiUrl = null,
  publicUrl = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = {
    apiUrl: normalizeRedisInsightApiUrl(apiUrl),
    publicUrl: normalizeRedisInsightPublicUrl(publicUrl),
    apiPathPrefix: getPublicUrlPath(normalizeRedisInsightPublicUrl(publicUrl)),
  };
  const isWebConfigured = Boolean(config.apiUrl && config.publicUrl);

  if (!fetchImpl && isWebConfigured) {
    throw new Error('A fetch implementation is required for RedisInsight web integration.');
  }

  return {
    isWebConfigured() {
      return isWebConfigured;
    },

    getPublicUrl() {
      return config.publicUrl;
    },

    async launch(target, { databaseAlias } = {}) {
      if (!isWebConfigured) {
        return {
          url: buildRedisInsightUrl(target, { databaseAlias }),
        };
      }

      try {
        const apiBasePath = buildRedisInsightApiBasePath(config);
        if (shouldStoreSensitiveCredentials(target)) {
          const settings = await requestRedisInsight(
            fetchImpl,
            config.apiUrl,
            `${apiBasePath}/settings`,
          );

          if (!hasInitializedCredentialStorage(settings)) {
            throw createRequestError(
              'RedisInsight web is not initialized for credential storage yet. '
              + 'Open RedisInsight once, complete the initial settings/EULA flow, '
              + 'and then retry this connection.',
            );
          }
        }

        const payload = buildRedisInsightDatabasePayload(target, { databaseAlias });
        const databaseApiPath = `${apiBasePath}/databases`;
        const databases = await requestRedisInsight(fetchImpl, config.apiUrl, databaseApiPath);
        const existingDatabase = Array.isArray(databases)
          ? databases.find((database) => databaseMatchesTarget(database, target))
          : null;

        if (existingDatabase?.id) {
          let databaseId = existingDatabase.id;

          try {
            const current = await requestRedisInsight(
              fetchImpl,
              config.apiUrl,
              `${databaseApiPath}/${databaseId}`,
            );
            databaseId = current?.id || databaseId;
            await requestRedisInsight(fetchImpl, config.apiUrl, `${databaseApiPath}/${databaseId}`, {
              method: 'PATCH',
              body: JSON.stringify(payload),
            });
          } catch (error) {
            if (error.kind === 'redisinsight') {
              const created = await requestRedisInsight(fetchImpl, config.apiUrl, databaseApiPath, {
                method: 'POST',
                body: JSON.stringify(payload),
              });
              databaseId = created.id;
            } else {
              throw error;
            }
          }

          return {
            url: buildRedisInsightBrowserUrl(config.publicUrl, databaseId),
          };
        }

        const created = await requestRedisInsight(fetchImpl, config.apiUrl, databaseApiPath, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        return {
          url: buildRedisInsightBrowserUrl(config.publicUrl, created.id),
        };
      } catch (error) {
        if (error.kind === 'redisinsight') {
          throw error;
        }

        throw createRequestError(`Could not launch RedisInsight. ${error.message}`, error);
      }
    },
  };
}

export function createRedisInsightProxyHandler({ apiUrl, publicPath }) {
  if (!apiUrl || !publicPath) {
    return null;
  }

  const upstreamUrl = new URL(apiUrl);
  const transport = upstreamUrl.protocol === 'https:' ? https : http;

  return function proxyRedisInsightHttp(req, res) {
    const proxyRequest = transport.request(
      {
        protocol: upstreamUrl.protocol,
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port,
        method: req.method,
        path: req.originalUrl,
        headers: {
          ...req.headers,
          host: upstreamUrl.host,
          connection: req.headers.upgrade ? 'upgrade' : 'keep-alive',
        },
      },
      (proxyResponse) => {
        res.status(proxyResponse.statusCode ?? 502);
        Object.entries(proxyResponse.headers).forEach(([name, value]) => {
          if (value !== undefined) {
            res.setHeader(name, value);
          }
        });
        proxyResponse.pipe(res);
      },
    );

    proxyRequest.on('error', (error) => {
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          error: `RedisInsight proxy request failed. ${error.message}`,
        });
      } else {
        res.end();
      }
    });

    req.pipe(proxyRequest);
  };
}

export const REDISINSIGHT_DEFAULT_PUBLIC_PATH = DEFAULT_PUBLIC_PATH;
