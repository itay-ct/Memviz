import { createClient } from 'redis';
import { parseDocument } from 'yaml';

import { buildRedisUrl } from './redis-target.js';

const FIRST_NAMES = [
  'Ava',
  'Liam',
  'Maya',
  'Noah',
  'Iris',
  'Ethan',
  'Leah',
  'Milo',
  'Nora',
  'Ezra',
  'Mia',
  'Owen',
];

const LAST_NAMES = [
  'Smith',
  'Levy',
  'Cohen',
  'Brown',
  'Davis',
  'Garcia',
  'Miller',
  'Wilson',
  'Taylor',
  'Anderson',
  'Thomas',
  'Martin',
];

const CITIES = [
  'New York',
  'London',
  'Berlin',
  'Paris',
  'Tel Aviv',
  'Madrid',
  'Rome',
  'Austin',
  'Chicago',
  'Toronto',
  'Seattle',
  'Dublin',
];

const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Germany',
  'France',
  'Israel',
  'Spain',
  'Italy',
  'Canada',
  'Netherlands',
  'Australia',
];

function createLoaderError(message, kind = 'load') {
  const error = new Error(message);
  error.kind = kind;
  return error;
}

function parseYamlText(text, label) {
  const document = parseDocument(text ?? '');
  if (document.errors.length) {
    throw createLoaderError(
      `${label} YAML: ${document.errors[0].message}`.trim(),
      'validation',
    );
  }

  return document.toJSON() ?? {};
}

function createSeededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

function asInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function asFloat(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createFullName(random) {
  const firstName = pick(FIRST_NAMES, random);
  const lastName = pick(LAST_NAMES, random);

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
  };
}

function createEmail(context, random, index) {
  const duplicateRatio = asFloat(context.patterns?.duplicate_email_ratio, 0);
  const fixedEmail = context.patterns?.fixed_email;
  const duplicateEmailValue = context.patterns?.duplicate_email_value;

  if (index === 0 && fixedEmail) {
    context.generatedEmails.push(fixedEmail);
    return fixedEmail;
  }

  if (duplicateRatio > 0 && duplicateEmailValue && random() < duplicateRatio) {
    return duplicateEmailValue;
  }

  if (duplicateRatio > 0 && context.generatedEmails.length && random() < duplicateRatio) {
    return pick(context.generatedEmails, random);
  }

  const { firstName, lastName } = createFullName(random);
  const discriminator = duplicateRatio > 0 ? Math.max(1, Math.floor(index * 0.9)) : index;
  const email = `${sanitizeToken(firstName)}.${sanitizeToken(lastName)}.${discriminator}@example.com`;
  context.generatedEmails.push(email);
  return email;
}

function generateValue(fieldName, fieldSpec, context, index) {
  const type = String(fieldSpec?.type ?? 'string').toLowerCase();

  if (type === 'int') {
    if (fieldSpec?.unique) {
      return index + 1;
    }

    const min = asInteger(fieldSpec?.min, 0);
    const max = Math.max(min, asInteger(fieldSpec?.max, min + 100));
    return min + Math.floor(context.random() * (max - min + 1));
  }

  if (type === 'float') {
    const min = asFloat(fieldSpec?.min, 0);
    const max = Math.max(min, asFloat(fieldSpec?.max, min + 100));
    const value = min + context.random() * (max - min);
    return Number(value.toFixed(2));
  }

  if (type === 'full_name') {
    return createFullName(context.random).fullName;
  }

  if (type === 'first_name') {
    return pick(FIRST_NAMES, context.random);
  }

  if (type === 'last_name') {
    return pick(LAST_NAMES, context.random);
  }

  if (type === 'email') {
    return createEmail(context, context.random, index + 1);
  }

  if (type === 'city') {
    return pick(CITIES, context.random);
  }

  if (type === 'country') {
    return pick(COUNTRIES, context.random);
  }

  if (type === 'tag' || type === 'text' || type === 'string') {
    return `${sanitizeToken(fieldName) || 'field'}-${index + 1}`;
  }

  return `${sanitizeToken(fieldName) || 'field'}-${index + 1}`;
}

function buildRecord(datasetSpec, index, context) {
  const fields = datasetSpec?.generator?.fields ?? {};
  const record = {};

  for (const [fieldName, fieldSpec] of Object.entries(fields)) {
    record[fieldName] = generateValue(fieldName, fieldSpec, context, index);
  }

  if (record.id === undefined) {
    record.id = index + 1;
  }

  return record;
}

async function commandSupported(client, commandName) {
  try {
    const response = await client.sendCommand(['COMMAND', 'INFO', commandName]);
    return Array.isArray(response) ? Boolean(response[0]) : Boolean(response);
  } catch {
    return false;
  }
}

function toRedisString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function getRecordKey(storageSpec, record, index) {
  const prefix = String(storageSpec?.key_prefix ?? 'record:');
  const suffix = record.id ?? index + 1;
  return `${prefix}${suffix}`;
}

function buildSearchFieldArgs(storageType, fields) {
  const args = [];

  for (const field of fields ?? []) {
    if (storageType === 'json') {
      const path = field?.path;
      if (!path) {
        continue;
      }

      const alias = sanitizeToken(String(path).replace(/^\$\./, '').replace(/\./g, '_')) || 'field';
      args.push(path, 'AS', alias, String(field?.type ?? 'TEXT').toUpperCase());
    } else {
      const fieldName = field?.field;
      if (!fieldName) {
        continue;
      }

      args.push(fieldName, String(field?.type ?? 'TEXT').toUpperCase());
    }

    if (field?.sortable) {
      args.push('SORTABLE');
    }
  }

  return args;
}

async function ensureSearchIndex(client, storageSpec) {
  if (!storageSpec?.index?.enabled) {
    return;
  }

  const supportsSearch = await commandSupported(client, 'FT.CREATE');
  if (!supportsSearch) {
    return;
  }

  const storageType = String(storageSpec?.type ?? 'json').toLowerCase();
  const fieldArgs = buildSearchFieldArgs(storageType, storageSpec.index.fields);
  if (!fieldArgs.length) {
    return;
  }

  const indexName = storageSpec.index.name ?? `idx:${sanitizeToken(storageSpec.key_prefix) || 'records'}`;
  const prefix = storageSpec.index.prefix ?? storageSpec.key_prefix ?? 'record:';
  const args = [
    'FT.CREATE',
    indexName,
    'ON',
    storageType === 'hash' ? 'HASH' : 'JSON',
    'PREFIX',
    '1',
    prefix,
    'SCHEMA',
    ...fieldArgs,
  ];

  try {
    await client.sendCommand(args);
  } catch (error) {
    if (/index already exists/i.test(error.message)) {
      return;
    }

    if (/unknown command/i.test(error.message)) {
      return;
    }

    throw error;
  }
}

async function dropSearchIndexIfNeeded(client, storageSpec) {
  const indexName = storageSpec?.index?.name;
  if (!indexName) {
    return;
  }

  const supportsSearch = await commandSupported(client, 'FT.DROPINDEX');
  if (!supportsSearch) {
    return;
  }

  try {
    await client.sendCommand(['FT.DROPINDEX', indexName, 'DD']);
  } catch (error) {
    if (/unknown index name/i.test(error.message) || /unknown command/i.test(error.message)) {
      return;
    }

    throw error;
  }
}

async function createRecordWriter(client, storageSpec) {
  const storageType = String(storageSpec?.type ?? 'json').toLowerCase();
  const supportsRedisJson =
    storageType === 'json' ? await commandSupported(client, 'JSON.SET') : false;

  return (record, index) => {
    const key = getRecordKey(storageSpec, record, index);

    if (storageType === 'hash') {
      const hash = {};
      for (const [fieldName, value] of Object.entries(record)) {
        hash[fieldName] = toRedisString(value);
      }

      return client.hSet(key, hash);
    }

    const serialized = JSON.stringify(record);
    if (supportsRedisJson) {
      return client.sendCommand(['JSON.SET', key, '$', serialized]);
    }

    return client.set(key, serialized);
  };
}

export async function loadDatasetIntoRedis({
  datasetYaml,
  flushEnabled,
  onProgress,
  storageYaml,
  target,
}) {
  const datasetSpec = parseYamlText(datasetYaml, 'Dataset spec');
  const storageSpec = parseYamlText(storageYaml, 'Storage spec');
  const totalRecords = asInteger(datasetSpec?.records, 0);
  const batchSize = Math.max(1, asInteger(storageSpec?.pipeline_size, 1000));
  const client = createClient({
    url: buildRedisUrl(target),
  });

  onProgress?.({
    status: 'running',
    progressPct: 2,
    message: 'Parsing dataset spec',
  });

  await client.connect();

  try {
    onProgress?.({
      status: 'running',
      progressPct: 8,
      message: 'Connected to Redis',
    });

    if (flushEnabled) {
      onProgress?.({
        status: 'running',
        progressPct: 12,
        message: 'Flushing database',
      });

      await dropSearchIndexIfNeeded(client, storageSpec);
      await client.flushDb();
    }

    const random = createSeededRandom(asInteger(datasetSpec?.seed, 42));
    const context = {
      generatedEmails: [],
      patterns: datasetSpec?.generator?.patterns ?? datasetSpec?.patterns ?? {},
      random,
    };
    const writeRecord = await createRecordWriter(client, storageSpec);
    const startPct = 18;
    const loadSpan = 74;

    if (!totalRecords) {
      onProgress?.({
        status: 'running',
        progressPct: 92,
        message: 'No records requested, skipping writes',
      });
    }

    for (let offset = 0; offset < totalRecords; offset += batchSize) {
      const size = Math.min(batchSize, totalRecords - offset);
      const commands = [];

      for (let index = 0; index < size; index += 1) {
        const recordIndex = offset + index;
        const record = buildRecord(datasetSpec, recordIndex, context);
        commands.push(writeRecord(record, recordIndex));
      }

      await Promise.all(commands);

      const completed = Math.min(totalRecords, offset + size);
      const progressPct = startPct + (completed / totalRecords) * loadSpan;
      onProgress?.({
        status: 'running',
        progressPct,
        message: `Loading dataset (${completed.toLocaleString()} / ${totalRecords.toLocaleString()})`,
      });
    }

    onProgress?.({
      status: 'running',
      progressPct: 95,
      message: 'Preparing index',
    });

    await ensureSearchIndex(client, storageSpec);

    onProgress?.({
      status: 'completed',
      progressPct: 100,
      message: `Loaded ${totalRecords.toLocaleString()} records`,
      summary: {
        totalRecords,
        storageType: String(storageSpec?.type ?? 'json').toLowerCase(),
      },
    });

    return {
      datasetSpec,
      storageSpec,
      totalRecords,
    };
  } finally {
    if (client.isOpen) {
      await client.disconnect().catch(() => {});
    } else if (typeof client.destroy === 'function') {
      client.destroy();
    }
  }
}
