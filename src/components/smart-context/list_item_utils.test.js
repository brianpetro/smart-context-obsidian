import test from 'ava';
import { can_delete_context } from './list_item_utils.js';

test('can_delete_context returns false for empty names', (t) => {
  const ctx = { data: { name: '' } };
  t.false(can_delete_context(ctx));
});

test('can_delete_context returns true for non-empty names', (t) => {
  const ctx = { data: { name: 'Saved Context' } };
  t.true(can_delete_context(ctx));
});
