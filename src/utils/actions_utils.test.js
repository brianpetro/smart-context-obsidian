import test from 'ava';
import {
  get_context_name_input_value,
  persist_context_name,
  resolve_name_status,
} from './actions_utils.js';

test('resolve_name_status hides label when name is empty', (t) => {
  const ctx = { data: { name: '' } };
  const result = resolve_name_status(ctx, { input_value: '' });
  t.false(result.is_saved);
  t.is(result.label, '');
});

test('resolve_name_status returns saved label when input matches name', (t) => {
  const ctx = { data: { name: 'Project Alpha' } };
  const result = resolve_name_status(ctx, { input_value: 'Project Alpha' });
  t.true(result.is_saved);
  t.is(result.label, 'Saved');
});

test('resolve_name_status hides label when input differs from name', (t) => {
  const ctx = { data: { name: 'Project Alpha' } };
  const result = resolve_name_status(ctx, { input_value: 'Project Beta' });
  t.false(result.is_saved);
  t.is(result.label, '');
});