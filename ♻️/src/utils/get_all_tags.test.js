import test from 'ava';
import { get_all_tags } from './get_all_tags.js';

test('returns tag names from metadataCache', t => {
  const app = { metadataCache: { getTags() { return { '#foo': {}, '#bar': {} }; } } };
  t.deepEqual(get_all_tags(app), ['#foo', '#bar']);
});
