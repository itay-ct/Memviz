const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 6379;
const DEFAULT_USERNAME = 'default';

function createValidationError(message) {
  const error = new Error(message);
  error.kind = 'validation';
  return error;
}

function parseDatabase(pathname) {
  if (!pathname || pathname === '/') {
    return 0;
  }

  const db = Number(pathname.replace(/^\//, ''));
  if (!Number.isInteger(db) || db < 0) {
    throw createValidationError('Redis URL database must be a non-negative integer.');
  }

  return db;
}

function parsePort(rawPort) {
  if (!rawPort) {
    return DEFAULT_PORT;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw createValidationError('Redis port must be a whole number between 1 and 65535.');
  }

  return port;
}

function isRedisUrl(value) {
  return /^rediss?:\/\//i.test(value);
}

export function normalizeRedisTarget(input = {}) {
  const rawHostOrUrl = String(input.hostOrUrl ?? '').trim() || DEFAULT_HOST;
  const fieldPort = String(input.port ?? '').trim();
  const fieldUsername = String(input.username ?? '').trim() || DEFAULT_USERNAME;
  const fieldPassword = String(input.password ?? '');

  let host = rawHostOrUrl;
  let port = parsePort(fieldPort);
  let username = fieldUsername;
  let password = fieldPassword;
  let tls = false;
  let db = 0;
  let mode = 'hostport';

  if (rawHostOrUrl.includes('://') && !isRedisUrl(rawHostOrUrl)) {
    throw createValidationError('Redis URL must start with redis:// or rediss://.');
  }

  if (isRedisUrl(rawHostOrUrl)) {
    let parsedUrl;

    try {
      parsedUrl = new URL(rawHostOrUrl);
    } catch {
      throw createValidationError('Enter a valid Redis URL.');
    }

    if (!parsedUrl.hostname) {
      throw createValidationError('Redis URL must include a host.');
    }

    host = parsedUrl.hostname;
    port = parsePort(parsedUrl.port || fieldPort);
    username = parsedUrl.username
      ? decodeURIComponent(parsedUrl.username)
      : fieldUsername;
    password = parsedUrl.password
      ? decodeURIComponent(parsedUrl.password)
      : fieldPassword;
    tls = parsedUrl.protocol === 'rediss:';
    db = parseDatabase(parsedUrl.pathname);
    mode = 'uri';
  }

  if (!host) {
    throw createValidationError('Redis host is required.');
  }

  const hasAuth = Boolean(password) || (username && username !== DEFAULT_USERNAME);

  return {
    host,
    port,
    username: username || DEFAULT_USERNAME,
    password,
    tls,
    db,
    hasAuth,
    mode,
    summary: `${host}:${port}`,
  };
}

export function buildRedisUrl(target, { redactPassword = false } = {}) {
  const scheme = target.tls ? 'rediss' : 'redis';
  const database = Number.isInteger(target.db) ? target.db : 0;

  if (!target.hasAuth) {
    return `${scheme}://${target.host}:${target.port}/${database}`;
  }

  const encodedUser = encodeURIComponent(target.username || DEFAULT_USERNAME);
  const encodedPassword = redactPassword
    ? '***'
    : encodeURIComponent(target.password ?? '');
  const auth = target.password
    ? `${encodedUser}:${encodedPassword}@`
    : `${encodedUser}@`;

  return `${scheme}://${auth}${target.host}:${target.port}/${database}`;
}

export function buildRedisInsightUrl(target, { databaseAlias } = {}) {
  const scheme = target.tls ? 'rediss' : 'redis';
  const database = Number.isInteger(target.db) ? target.db : 0;
  const encodedUser = encodeURIComponent(target.username || DEFAULT_USERNAME);
  const encodedPassword = encodeURIComponent(target.password ?? '');
  const auth =
    target.password !== undefined && target.password !== ''
      ? `${encodedUser}:${encodedPassword}@`
      : target.username
        ? `${encodedUser}@`
        : '';

  const params = new URLSearchParams({
    redisUrl: `${scheme}://${auth}${target.host}:${target.port}/${database}`,
    redirect: '/browser',
  });

  if (databaseAlias) {
    params.set('databaseAlias', databaseAlias);
  }

  return `redisinsight://databases/connect?${params.toString()}`;
}

export function buildMemtierConnectionArgs(target) {
  if (!target.hasAuth && !target.tls && (target.db ?? 0) === 0) {
    return ['--host', target.host, '--port', String(target.port)];
  }

  return ['--uri', buildRedisUrl(target)];
}

export function serializeConnectionTarget(target) {
  if (!target) {
    return null;
  }

  return {
    host: target.host,
    port: target.port,
    username: target.username,
    tls: target.tls,
    db: target.db,
    hasAuth: target.hasAuth,
    mode: target.mode,
    summary: target.summary,
  };
}
