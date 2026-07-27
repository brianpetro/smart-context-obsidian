import test from 'ava';
import {
  env_open_folder_in_context_builder,
  menus,
} from './open_folder_in_context_builder.js';

function create_env() {
  const action_calls = [];
  const env = {
    smart_sources: {
      filter({ key_starts_with }) {
        return [
          { key: 'Folder/A.md' },
          { key: 'Folder/B.md' },
          { key: 'Other/C.md' },
        ].filter((source) => source.key.startsWith(key_starts_with));
      },
    },
    smart_contexts: {
      actions: {
        smart_contexts_open_new(params) {
          action_calls.push(params);
          return { key: 'new-context' };
        },
      },
    },
  };
  return { env, action_calls };
}

test('opens a folder through the existing scoped Builder action', (t) => {
  const { env, action_calls } = create_env();

  t.true(env_open_folder_in_context_builder.call(env, {
    folder: { path: 'Folder' },
  }));

  t.deepEqual(action_calls, [{
    add_items: ['Folder/A.md', 'Folder/B.md'],
    origin: {
      kind: 'folder',
      source_path: 'Folder',
      selection_count: 1,
      seeded_keys: ['Folder/A.md', 'Folder/B.md'],
    },
    event_source: 'env_open_folder_in_context_builder',
  }]);
});

test('folder action preserves an explicit empty seed set', (t) => {
  const { env, action_calls } = create_env();
  env.smart_sources.filter = () => [];

  t.true(env_open_folder_in_context_builder.call(env, {
    folder: { path: 'Empty' },
  }));
  t.deepEqual(action_calls[0].add_items, []);
  t.deepEqual(action_calls[0].origin, {
    kind: 'folder',
    source_path: 'Empty',
    selection_count: 1,
    seeded_keys: [],
  });
});

test('folder menu keeps the existing placement', (t) => {
  const menu = menus['env:folder_menu'];

  t.is(menu.title, 'Open folder in Context Builder');
  t.true(menu.when.call({
    params: {
      folder: { path: 'Folder' },
    },
  }));
});
