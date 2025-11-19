import test from 'ava';
import { get_block_suggestions } from './get_block_suggestions.js';

class DummyBlock {
  constructor(env, { key, lines }) {
    this.env = env;
    this.key = key;
    this.lines = lines;
  }
  async read() {
    return Array.isArray(this.lines) ? this.lines.join('\n') : String(this.lines || '');
  }
}

function create_env() {
  const map = new Map();
  return {
    smart_blocks: {
      get: (k) => map.get(k),
      set: (block) => map.set(block.key, block),
      item_type: DummyBlock,
    },
  };
}

test('returns empty array when source has no blocks', async (t) => {
  const env = create_env();
  const source = { key: 'note.md', data: {}, env };
  const suggestions = await get_block_suggestions(source);
  t.deepEqual(suggestions, []);
});

test('includes content snippets and reuses existing blocks', async (t) => {
  const env = create_env();
  const existing = new DummyBlock(env, { key: 'note.md#^a', lines: ['alpha'] });
  env.smart_blocks.set(existing);
  const source = {
    key: 'note.md',
    data: { blocks: { '#^a': ['alpha'], '#^b': ['bravo charlie'] } },
    env,
  };
  const suggestions = await get_block_suggestions(source);
  t.is(suggestions.length, 2);
  t.is(suggestions[0].item, existing);
  t.true(suggestions[1].path.includes('bravo charlie'));
});
