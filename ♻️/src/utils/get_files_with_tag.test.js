import test from 'ava';
import { get_files_with_tag } from './get_files_with_tag.js';

test('returns files containing specified tag', t => {
  const files = [{ path: 'foo.md' }, { path: 'bar.md' }];
  const cache = {
    'foo.md': { tags: [{ tag: '#foo' }] },
    'bar.md': { tags: [{ tag: '#bar' }, { tag: '#foo' }] }
  };
  const app = {
    vault: { getMarkdownFiles: () => files },
    metadataCache: { getFileCache: (f) => cache[f.path] }
  };
  t.deepEqual(get_files_with_tag(app, '#foo'), ['foo.md', 'bar.md']);
  t.deepEqual(get_files_with_tag(app, '#bar'), ['bar.md']);
});

// New test for frontmatter tags
test('returns files containing specified tag in frontmatter', t => {
  const files = [{ path: 'baz.md' }, { path: 'qux.md' }];
  const cache = {
    'baz.md': { frontmatter: { tags: ['foo', 'bar'] } },
    'qux.md': { frontmatter: { tags: ['baz'] } }
  };
  const app = {
    vault: { getMarkdownFiles: () => files },
    metadataCache: { getFileCache: (f) => cache[f.path] }
  };
  t.deepEqual(get_files_with_tag(app, '#foo'), ['baz.md']);
  t.deepEqual(get_files_with_tag(app, '#bar'), ['baz.md']);
  t.deepEqual(get_files_with_tag(app, '#baz'), ['qux.md']);
});
