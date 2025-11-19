import test from 'ava';
import { get_all_open_file_paths } from './get_all_open_file_paths.js';

function leaf(path, use_state = false) {
  return {
    type: 'leaf',
    view: use_state ? { state: { file: path } } : { file: { path } },
  };
}

function app_with_leaves(leaves) {
  return { workspace: { rootSplit: { children: leaves } } };
}

test('deduplicates open file paths', t => {
  const app = app_with_leaves([
    leaf('foo.md'),
    { children: [leaf('foo.md'), leaf('bar.bin')] },
  ]);
  const paths = get_all_open_file_paths(app);
  t.deepEqual(paths, ['foo.md']);
});

test('reads file path from state.file', t => {
  const app = app_with_leaves([leaf('bar.md', true)]);
  const paths = get_all_open_file_paths(app);
  t.deepEqual(paths, ['bar.md']);
});
