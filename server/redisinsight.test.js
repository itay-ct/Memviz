import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRedisInsightDatabasePayload,
  createRedisInsightService,
} from './redisinsight.js';

function createMockResponse(payload, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return {
    ok,
    status,
    statusText,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'application/json' : null;
      },
    },
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test('launch falls back to desktop deep link when web integration is not configured', async () => {
  const service = createRedisInsightService();
  const target = {
    host: 'redis',
    port: 6379,
    username: 'default',
    password: '',
    tls: false,
    db: 0,
    summary: 'redis:6379',
  };

  const launched = await service.launch(target, { databaseAlias: 'Portal Redis' });

  assert.match(launched.url, /^redisinsight:\/\/databases\/connect\?/);
  assert.match(launched.url, /databaseAlias=Portal\+Redis/);
});

test('launch creates a RedisInsight database when no reusable entry exists', async () => {
  const calls = [];
  const service = createRedisInsightService({
    apiUrl: 'http://redisinsight:5540',
    publicUrl: '/redisinsight',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });

      if (url.endsWith('/api/settings')) {
        return createMockResponse({
          agreements: {
            encryption: false,
            eula: true,
          },
        });
      }

      if (url.endsWith('/api/databases')) {
        if (!options.method) {
          return createMockResponse([]);
        }

        return createMockResponse({ id: 'ri-created' }, { status: 201 });
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  const target = {
    host: 'redis',
    port: 6379,
    username: 'default',
    password: 'secret',
    tls: false,
    db: 0,
    summary: 'redis:6379',
  };

  const launched = await service.launch(target, { databaseAlias: 'Portal Redis' });

  assert.equal(launched.url, '/redisinsight/ri-created/browser');
  assert.equal(calls.length, 3);
  assert.equal(calls[2].options.method, 'POST');

  const postedBody = JSON.parse(calls[2].options.body);
  assert.deepEqual(postedBody, buildRedisInsightDatabasePayload(target, { databaseAlias: 'Portal Redis' }));
  assert.doesNotMatch(launched.url, /secret/);
});

test('launch reuses and patches an existing RedisInsight database when one matches', async () => {
  const calls = [];
  const service = createRedisInsightService({
    apiUrl: 'http://redisinsight:5540',
    publicUrl: '/redisinsight',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });

      if (url.endsWith('/api/settings')) {
        return createMockResponse({
          agreements: {
            encryption: false,
            eula: true,
          },
        });
      }

      if (url.endsWith('/api/databases') && !options.method) {
        return createMockResponse([
          {
            id: 'ri-existing',
            host: 'redis',
            port: 6379,
            db: 0,
          },
        ]);
      }

      if (url.endsWith('/api/databases/ri-existing') && !options.method) {
        return createMockResponse({
          id: 'ri-existing',
          host: 'redis',
          port: 6379,
          db: 0,
          name: 'Old name',
        });
      }

      if (url.endsWith('/api/databases/ri-existing') && options.method === 'PATCH') {
        return createMockResponse({ id: 'ri-existing' });
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  const target = {
    host: 'redis',
    port: 6379,
    username: 'default',
    password: 'secret',
    tls: false,
    db: 0,
    summary: 'redis:6379',
  };

  const launched = await service.launch(target, { databaseAlias: 'Portal Redis' });

  assert.equal(launched.url, '/redisinsight/ri-existing/browser');
  assert.equal(calls.length, 4);
  assert.equal(calls[3].options.method, 'PATCH');

  const patchedBody = JSON.parse(calls[3].options.body);
  assert.equal(patchedBody.password, 'secret');
  assert.equal(patchedBody.name, 'Portal Redis');
  assert.doesNotMatch(launched.url, /secret/);
});

test('launch fails with an actionable message when RedisInsight credential storage is not initialized', async () => {
  const service = createRedisInsightService({
    apiUrl: 'http://redisinsight:5540',
    publicUrl: '/redisinsight',
    fetchImpl: async (url) => {
      if (url.endsWith('/api/settings')) {
        return createMockResponse({
          agreements: null,
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  await assert.rejects(
    service.launch({
      host: 'cache.example.com',
      port: 6380,
      username: 'default',
      password: 'secret',
      tls: true,
      db: 0,
      summary: 'cache.example.com:6380',
    }, { databaseAlias: 'Cloud Redis' }),
    /not initialized for credential storage yet/i,
  );
});
