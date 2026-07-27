import test from 'ava';
import { resolve_primary_control } from './builder_primary_control.js';

const action = (params = {}) => ({
  action_key: params.action_key || 'copy_text',
  disabled: params.disabled === true,
  menu_only: params.menu_only === true,
  order: params.order || 0,
  run: params.run || (() => true),
});

test('empty context resolves Add sources', (t) => {
  const state = resolve_primary_control({ item_count: 0 });

  t.is(state.intent, 'add_sources');
  t.is(state.mode, 'direct');
  t.is(state.label, 'Add sources');
});

test('one runnable copy action resolves a direct primary action', (t) => {
  const copy_action = action();
  const state = resolve_primary_control({ item_count: 1 }, {
    copy_actions: [copy_action],
  });

  t.is(state.intent, 'copy_context');
  t.is(state.mode, 'direct');
  t.is(state.primary_action, copy_action);
});

test('multiple visible actions resolve a split button', (t) => {
  const first = action({ action_key: 'copy_text' });
  const second = action({ action_key: 'copy_tree' });
  const state = resolve_primary_control({ item_count: 1 }, {
    copy_actions: [first, second],
  });

  t.is(state.mode, 'split');
  t.is(state.primary_action, first);
  t.is(state.copy_actions.length, 2);
});

test('disabled and menu-only actions cannot become primary', (t) => {
  const disabled = action({ action_key: 'disabled', disabled: true });
  const menu_only = action({ action_key: 'submenu', menu_only: true });
  const enabled = action({ action_key: 'enabled' });
  const state = resolve_primary_control({ item_count: 1 }, {
    copy_actions: [disabled, menu_only, enabled],
  });

  t.is(state.primary_action, enabled);
});

test('menu-only actions remain available as copy options', (t) => {
  const menu_only = action({ action_key: 'submenu', menu_only: true });
  const state = resolve_primary_control({ item_count: 1 }, {
    copy_actions: [menu_only],
  });

  t.is(state.intent, 'copy_options');
  t.is(state.mode, 'menu');
  t.is(state.primary_action, null);
});

test('copy capability is unavailable only when no copy actions exist', (t) => {
  const state = resolve_primary_control({ item_count: 1 }, {
    copy_actions: [],
  });

  t.is(state.intent, 'copy_unavailable');
  t.is(state.mode, 'none');
});

test('resolved source count can mark an empty expanded selection', (t) => {
  const state = resolve_primary_control({ item_count: 1 }, {
    source_count: 0,
    copy_actions: [action()],
  });

  t.is(state.intent, 'add_sources');
  t.is(state.mode, 'direct');
});
