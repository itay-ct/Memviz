import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectDatabaseConnectionDetails,
  detectDatabaseSourceFromHost,
  detectDatabaseSourceFromServerInfo,
  getDatabaseSourceDisplayLabel,
} from '../shared/database-source.js';

test('detectDatabaseSourceFromHost identifies Redis Cloud endpoints', () => {
  assert.deepEqual(detectDatabaseSourceFromHost('redis://default:secret@cache.redislabs.com:12345/0'), {
    engine: 'redis',
    service: 'redis-cloud',
  });
  assert.deepEqual(
    detectDatabaseSourceFromHost('rediss://redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com:12345'),
    {
      engine: 'redis',
      service: 'redis-cloud',
    },
  );
  assert.deepEqual(detectDatabaseSourceFromHost('redis-12345.c1.us-east-1-2.ec2.cloud.redis.io'), {
    engine: 'redis',
    service: 'redis-cloud',
  });
  assert.deepEqual(detectDatabaseSourceFromHost('redis.io:6379'), {
    engine: 'redis',
    service: 'redis-cloud',
  });
});

test('detectDatabaseSourceFromHost identifies managed provider endpoints', () => {
  assert.deepEqual(detectDatabaseSourceFromHost('my-cache.abc123.ng.0001.use1.cache.amazonaws.com'), {
    engine: 'redis',
    service: 'elasticache',
  });
  assert.deepEqual(detectDatabaseSourceFromHost('redis-cache.us-central1.redis.goog'), {
    engine: 'redis',
    service: 'memorystore',
  });
});

test('detectDatabaseSourceFromHost defaults private and unknown hosts to Redis', () => {
  assert.deepEqual(detectDatabaseSourceFromHost('10.0.0.8'), {
    engine: 'redis',
    service: 'self-managed',
  });
  assert.deepEqual(detectDatabaseSourceFromHost('redis.internal.example.com:6379'), {
    engine: 'redis',
    service: 'self-managed',
  });
});

test('detectDatabaseSourceFromServerInfo parses Redis and Valkey versions', () => {
  assert.deepEqual(detectDatabaseSourceFromServerInfo('# Server\r\nredis_version:7.4.8\r\n'), {
    engine: 'redis',
    version: '7.4.8',
  });
  assert.deepEqual(detectDatabaseSourceFromServerInfo('# Server\nvalkey_version:8.0.1\nredis_version:7.2.0\n'), {
    engine: 'valkey',
    version: '8.0.1',
  });
  assert.deepEqual(detectDatabaseSourceFromServerInfo(''), {
    engine: null,
    version: null,
  });
});

test('detectDatabaseConnectionDetails combines host service with INFO engine', () => {
  assert.deepEqual(
    detectDatabaseConnectionDetails({
      host: 'cluster.abc123.use1.cache.amazonaws.com',
      serverInfo: 'valkey_version:8.0.1\n',
    }),
    {
      databaseSource: {
        engine: 'valkey',
        service: 'elasticache',
      },
      databaseVersion: '8.0.1',
    },
  );
});

test('detectDatabaseConnectionDetails forces Redis engine for Redis Cloud', () => {
  assert.deepEqual(
    detectDatabaseConnectionDetails({
      host: 'cache.redislabs.com',
      serverInfo: 'valkey_version:8.0.1\n',
    }),
    {
      databaseSource: {
        engine: 'redis',
        service: 'redis-cloud',
      },
      databaseVersion: '8.0.1',
    },
  );
});

test('getDatabaseSourceDisplayLabel avoids duplicate Redis labels', () => {
  assert.equal(getDatabaseSourceDisplayLabel({ engine: 'redis', service: 'self-managed' }), 'Redis');
  assert.equal(getDatabaseSourceDisplayLabel({ engine: 'redis', service: 'redis-software' }), 'Redis');
  assert.equal(getDatabaseSourceDisplayLabel({ engine: 'redis', service: 'redis-cloud' }), 'Redis Cloud');
  assert.equal(getDatabaseSourceDisplayLabel({ engine: 'redis', service: 'elasticache' }), 'ElastiCache Redis');
  assert.equal(getDatabaseSourceDisplayLabel({ engine: 'valkey', service: 'memorystore' }), 'Memorystore Valkey');
});
