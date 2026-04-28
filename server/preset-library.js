import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

import { normalizeScenarioDefinition } from './scenarios.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const PRESET_FILE_SUFFIX = '.preset.yaml';
const DEFAULT_PRESET_NAME = 'general';

let presetLibraryCache = [];
let selectedPresetName = null;

function createPresetError(message, code = 'preset_validation') {
  const error = new Error(message);
  error.kind = 'validation';
  error.code = code;
  return error;
}

function normalizeString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function requireNonEmptyString(value, message) {
  const normalized = normalizeString(value).trim();
  if (!normalized) {
    throw createPresetError(message);
  }

  return normalized;
}

function sanitizeFileStem(value) {
  return normalizeString(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeOptionalInteger(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw createPresetError('Dataset preset record count must be a number.');
  }

  return Math.max(0, Math.round(parsed));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeString(entry).trim())
        .filter(Boolean),
    ),
  );
}

function extractIndexesFromStorageYaml(storageYaml, presetName) {
  const document = parseDocument(storageYaml ?? '');
  if (document.errors.length) {
    throw createPresetError(
      `Dataset preset "${presetName}" storage YAML is invalid: ${document.errors[0].message}`.trim(),
      'preset_parse',
    );
  }

  const config = document.toJSON() ?? {};
  const indexConfig = config.index;

  if (!indexConfig || indexConfig.enabled === false) {
    return [];
  }

  const indexes = normalizeStringArray(indexConfig.names);
  const primaryName = normalizeString(indexConfig.name).trim();

  if (primaryName) {
    indexes.unshift(primaryName);
  }

  return Array.from(new Set(indexes));
}

function normalizeDatasetPreset(input = {}) {
  const name = requireNonEmptyString(input.name, 'Dataset preset name is required.');
  const storageYaml = requireNonEmptyString(
    input.storage_yaml ?? input.storageYaml,
    'Dataset preset storage YAML is required.',
  );

  return {
    id: requireNonEmptyString(input.id, 'Dataset preset id is required.'),
    name,
    recordCount: normalizeOptionalInteger(
      input.record_count ?? input.recordCount,
      null,
    ),
    totalSize: requireNonEmptyString(
      input.total_size ?? input.totalSize ?? 'Custom size',
      'Dataset preset total size is required.',
    ),
    datasetYaml: requireNonEmptyString(
      input.dataset_yaml ?? input.datasetYaml,
      'Dataset preset dataset YAML is required.',
    ),
    storageYaml,
    indexes: extractIndexesFromStorageYaml(storageYaml, name),
  };
}

function ensureUniqueIds(items, idKey, itemLabel) {
  const seen = new Set();

  for (const item of items) {
    const id = item[idKey];
    if (seen.has(id)) {
      throw createPresetError(`${itemLabel} id "${id}" must be unique within a preset.`);
    }

    seen.add(id);
  }
}

function normalizePresetDocument(rawPreset = {}, fileName) {
  const tests = Array.isArray(rawPreset.tests)
    ? rawPreset.tests.map((entry) => normalizeScenarioDefinition(entry))
    : [];
  const datasetPresets = Array.isArray(rawPreset.dataset_presets ?? rawPreset.datasetPresets)
    ? (rawPreset.dataset_presets ?? rawPreset.datasetPresets).map((entry) => normalizeDatasetPreset(entry))
    : [];

  ensureUniqueIds(tests, 'id', 'Test');
  ensureUniqueIds(datasetPresets, 'id', 'Dataset preset');

  const name = requireNonEmptyString(rawPreset.name, `Preset name is required in ${fileName}.`);

  return {
    name,
    label: requireNonEmptyString(rawPreset.label ?? name, `Preset label is required in ${fileName}.`),
    fileName,
    tests,
    datasetPresets,
  };
}

async function readPresetFile(fileName) {
  const fullPath = path.join(projectRoot, fileName);
  const contents = await fs.readFile(fullPath, 'utf8');
  const document = parseDocument(contents);

  if (document.errors.length) {
    throw createPresetError(`${fileName}: ${document.errors[0].message}`.trim(), 'preset_parse');
  }

  const rawPreset = document.toJSON() ?? {};
  return normalizePresetDocument(rawPreset, fileName);
}

function sortPresets(left, right) {
  if (left.name === DEFAULT_PRESET_NAME) {
    return -1;
  }

  if (right.name === DEFAULT_PRESET_NAME) {
    return 1;
  }

  return left.label.localeCompare(right.label);
}

function findPresetByName(name) {
  return presetLibraryCache.find((preset) => preset.name === name) ?? null;
}

function getDefaultPreset() {
  return findPresetByName(DEFAULT_PRESET_NAME) ?? presetLibraryCache[0] ?? null;
}

function ensurePresetLibraryLoaded() {
  if (!presetLibraryCache.length) {
    throw createPresetError('No preset files were found in the memviz root directory.', 'preset_missing');
  }
}

function getSelectedPreset() {
  ensurePresetLibraryLoaded();
  return findPresetByName(selectedPresetName) ?? getDefaultPreset();
}

export async function refreshPresetLibrary() {
  const entries = await fs.readdir(projectRoot, { withFileTypes: true });
  const presetFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(PRESET_FILE_SUFFIX))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (!presetFiles.length) {
    throw createPresetError(
      `No preset files matching *${PRESET_FILE_SUFFIX} were found in the memviz root directory.`,
      'preset_missing',
    );
  }

  const presets = await Promise.all(presetFiles.map(readPresetFile));
  const presetNames = new Set();

  for (const preset of presets) {
    if (presetNames.has(preset.name)) {
      throw createPresetError(`Preset name "${preset.name}" must be unique across preset files.`);
    }

    presetNames.add(preset.name);
  }

  presetLibraryCache = presets.sort(sortPresets);

  if (!selectedPresetName || !findPresetByName(selectedPresetName)) {
    selectedPresetName = getDefaultPreset()?.name ?? null;
  }

  return presetLibraryCache;
}

export async function initializePresetLibrary(preferredPresetName = null) {
  await refreshPresetLibrary();

  const preferredPreset = preferredPresetName ? findPresetByName(preferredPresetName) : null;
  if (preferredPreset) {
    selectedPresetName = preferredPreset.name;
  } else if (!selectedPresetName) {
    selectedPresetName = getDefaultPreset()?.name ?? null;
  }

  return getSelectedPreset();
}

export function getPresetClientState() {
  const selectedPreset = getSelectedPreset();

  return {
    presetOptions: presetLibraryCache.map((preset) => ({
      name: preset.name,
      label: preset.label,
    })),
    selectedPresetName: selectedPreset?.name ?? '',
    selectedPresetLabel: selectedPreset?.label ?? '',
    datasetPresets: selectedPreset?.datasetPresets ?? [],
    scenarios: selectedPreset?.tests ?? [],
  };
}

export function getScenarioById(id) {
  const selectedPreset = getSelectedPreset();
  return selectedPreset?.tests.find((scenario) => scenario.id === id) ?? null;
}

export function selectPresetByName(name) {
  ensurePresetLibraryLoaded();
  const preset = findPresetByName(name);
  if (!preset) {
    throw createPresetError(`Preset "${name}" was not found.`, 'preset_not_found');
  }

  selectedPresetName = preset.name;
  return preset;
}

export async function importPresetFile({ contents, fileName = '' }) {
  const normalizedContents = normalizeString(contents).trim();
  if (!normalizedContents) {
    throw createPresetError('Preset file contents are empty.', 'preset_empty');
  }

  await refreshPresetLibrary();

  const document = parseDocument(normalizedContents);
  if (document.errors.length) {
    throw createPresetError(document.errors[0].message.trim(), 'preset_parse');
  }

  const rawPreset = document.toJSON() ?? {};
  const preset = normalizePresetDocument(rawPreset, fileName || 'uploaded preset');

  if (findPresetByName(preset.name)) {
    throw createPresetError(`Preset "${preset.name}" already exists. Choose a different preset name.`, 'preset_exists');
  }

  const targetStem = sanitizeFileStem(preset.name);
  if (!targetStem) {
    throw createPresetError('Preset name must contain letters or numbers.', 'preset_name');
  }

  const targetPath = path.join(projectRoot, `${targetStem}${PRESET_FILE_SUFFIX}`);

  try {
    await fs.access(targetPath);
    throw createPresetError(
      `Preset file ${path.basename(targetPath)} already exists. Rename the preset and try again.`,
      'preset_file_exists',
    );
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  await fs.writeFile(targetPath, `${normalizedContents}\n`, 'utf8');
  await refreshPresetLibrary();
  selectPresetByName(preset.name);

  return {
    preset,
    savedFileName: path.basename(targetPath),
  };
}
