import test from 'ava';
import { write_smart_drag_data } from 'obsidian-smart-env/src/utils/smart_drag_drop.js';
import { resolve_dropped_context_item_keys } from './resolve_dropped_context_item_keys.js';

function create_data_transfer(data = {}) {
  return {
    data: { ...data },
    files: [],
    getData(type) {
      return this.data[type] || '';
    },
    setData(type, value) {
      this.data[type] = value;
    },
  };
}

function create_env() {
  const sources = {
    'Projects/Alpha.md': { key: 'Projects/Alpha.md', collection_key: 'smart_sources' },
    'Projects/Clients/Acme/Beta.md': { key: 'Projects/Clients/Acme/Beta.md', collection_key: 'smart_sources' },
    'Archive/Alpha.md': { key: 'Archive/Alpha.md', collection_key: 'smart_sources' },
  };
  const blocks = {
    'Projects/Alpha.md#Heading': { key: 'Projects/Alpha.md#Heading', collection_key: 'smart_blocks' },
  };
  const file_paths = [
    ...Object.keys(sources),
    'Assets/Diagram.png',
  ];

  return {
    fs: { file_paths },
    smart_blocks: {
      items: blocks,
      get(key) { return blocks[key]; },
    },
    smart_contexts: {
      get(key) {
        return key === 'context-1'
          ? { key, name: 'Named context', collection_key: 'smart_contexts' }
          : null
        ;
      },
    },
    smart_sources: {
      items: sources,
      fs: {
        file_paths,
        folder_paths: [
          'Projects',
          'Projects/Clients',
          'Projects/Clients/Acme',
          'Archive',
        ],
      },
      get(key) { return sources[key]; },
      filter({ key_starts_with }) {
        return Object.values(sources)
          .filter((source) => source.key.startsWith(key_starts_with));
      },
    },
  };
}

test('resolve_dropped_context_item_keys resolves Connections and Lookup Smart refs', (t) => {
  const env = create_env();
  const data_transfer = create_data_transfer();
  write_smart_drag_data(data_transfer, [
    env.smart_sources.get('Projects/Alpha.md'),
    env.smart_blocks.get('Projects/Alpha.md#Heading'),
  ]);

  t.deepEqual(resolve_dropped_context_item_keys(env, data_transfer), [
    'Projects/Alpha.md',
    'Projects/Alpha.md#Heading',
  ]);
});

test('resolve_dropped_context_item_keys does not treat named contexts as ordinary item keys', (t) => {
  const env = create_env();
  const data_transfer = create_data_transfer();
  write_smart_drag_data(data_transfer, {
    collection_key: 'smart_contexts',
    key: 'context-1',
  });

  t.deepEqual(resolve_dropped_context_item_keys(env, data_transfer), []);
});

test('resolve_dropped_context_item_keys resolves native files and media', (t) => {
  const env = create_env();
  const data_transfer = create_data_transfer({
    'text/plain': '/vault/Projects/Clients/Acme/Beta.md\n/vault/Assets/Diagram.png',
  });

  t.deepEqual(resolve_dropped_context_item_keys(env, data_transfer), [
    'Projects/Clients/Acme/Beta.md',
    'Assets/Diagram.png',
  ]);
});

test('resolve_dropped_context_item_keys resolves File Navigator file objects', (t) => {
  const env = create_env();
  const data_transfer = create_data_transfer();
  data_transfer.files = [
    { path: '/vault/Projects/Clients/Acme/Beta.md' },
  ];

  t.deepEqual(resolve_dropped_context_item_keys(env, data_transfer), [
    'Projects/Clients/Acme/Beta.md',
  ]);
});

test('resolve_dropped_context_item_keys expands a uniquely matched nested folder', (t) => {
  const env = create_env();
  const data_transfer = create_data_transfer({
    'text/plain': 'Acme.md',
  });

  t.deepEqual(resolve_dropped_context_item_keys(env, data_transfer), [
    'Projects/Clients/Acme/Beta.md',
  ]);
});

test('resolve_dropped_context_item_keys rejects an ambiguous file basename', (t) => {
  const env = create_env();
  const data_transfer = create_data_transfer({
    'text/plain': 'Alpha.md',
  });

  t.deepEqual(resolve_dropped_context_item_keys(env, data_transfer), []);
});

test('resolve_dropped_context_item_keys falls back to native data when Smart refs do not resolve', (t) => {
  const env = create_env();
  const data_transfer = create_data_transfer({
    'text/plain': 'Projects/Alpha.md',
  });
  write_smart_drag_data(data_transfer, {
    collection_key: 'missing_collection',
    key: 'Missing.md',
  });

  t.deepEqual(resolve_dropped_context_item_keys(env, data_transfer), [
    'Projects/Alpha.md',
  ]);
});
