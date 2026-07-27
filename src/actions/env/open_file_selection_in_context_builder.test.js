import test from 'ava';
import {
  env_open_file_selection_in_context_builder,
  menus,
} from './open_file_selection_in_context_builder.js';

function create_env() {
  const action_calls = [];
  const env = {
    smart_sources: {
      get(path) {
        return { key: `source:${path}` };
      },
      filter({ key_starts_with }) {
        return [
          { key: 'Folder/A.md' },
          { key: 'Folder/B.md' },
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

test('opens selected file-nav items through the existing scoped Builder action', (t) => {
  const { env, action_calls } = create_env();

  t.true(env_open_file_selection_in_context_builder.call(env, {
    files: [
      { path: 'A.md', extension: 'md' },
      { path: 'Folder', children: [] },
    ],
  }));

  t.deepEqual(action_calls, [{
    add_items: [
      'source:A.md',
      'Folder/A.md',
      'Folder/B.md',
    ],
    origin: {
      kind: 'file_selection',
      selection_count: 2,
      seeded_keys: [
        'source:A.md',
        'Folder/A.md',
        'Folder/B.md',
      ],
    },
    event_source: 'env_open_file_selection_in_context_builder',
  }]);
});

test('selection action preserves an explicit empty seed set', (t) => {
  const { env, action_calls } = create_env();
  env.smart_sources.get = () => null;
  env.smart_sources.filter = () => [];

  t.true(env_open_file_selection_in_context_builder.call(env, {
    files: [{ path: 'Empty', children: [] }],
  }));
  t.deepEqual(action_calls[0].add_items, []);
  t.deepEqual(action_calls[0].origin, {
    kind: 'file_selection',
    selection_count: 1,
    seeded_keys: [],
  });
});

test('file selection menu keeps the existing placement', (t) => {
  const { env } = create_env();
  const menu = menus['env:files_menu'];

  t.is(menu.title, 'Open selection in Context Builder');
  t.true(menu.when.call({
    scope: env,
    params: {
      files: [{ path: 'A.md', extension: 'md' }],
    },
  }));
});
