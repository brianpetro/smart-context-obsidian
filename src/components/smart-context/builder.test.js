import test from 'ava';
import { fileURLToPath } from 'node:url';
import { ComponentsLoader } from 'smart-environment/loaders/components_loader.js';
import { Menu } from 'obsidian';
import { post_process, render } from './builder.js';
import { create_builder_fixture, deferred } from '../../test_support/context_builder.js';

async function mount_builder(fixture, params = {}) {
  const container = fixture.builder_element(params);
  fixture.doc.body.appendChild(container);
  await post_process.call(fixture.smart_view, fixture.ctx, container, params);
  return container;
}

/** Capture native-menu configuration without depending on Obsidian menu DOM. */
function capture_source_menu(t) {
  const original_add = Menu.prototype.addItem;
  const original_show = Menu.prototype.showAtPosition;
  const entries = [];
  let position;
  Menu.prototype.addItem = function (configure) {
    const entry = {
      setTitle(title) { this.title = title; return this; },
      setIcon(icon) { this.icon = icon; return this; },
      onClick(callback) { this.run = callback; return this; },
    };
    configure(entry);
    entries.push(entry);
    return this;
  };
  Menu.prototype.showAtPosition = (next_position) => { position = next_position; };
  t.teardown(() => {
    Menu.prototype.addItem = original_add;
    Menu.prototype.showAtPosition = original_show;
  });
  return { entries, get position() { return position; } };
}

test.serial('review Add sources menu opens the canonical modal in the configured mode', async (t) => {
  const fixture = create_builder_fixture(t, { is_pro: true });
  const menu = capture_source_menu(t);
  const container = await mount_builder(fixture, { surface: 'context_builder_view' });
  const group = container.querySelector('.sc-context-builder-source-modes');
  const buttons = group.querySelectorAll('button');
  t.is(group.getAttribute('role'), 'group');
  t.is(group.parentElement.parentElement, container.querySelector('.sc-context-builder-view-meta'));
  t.deepEqual(buttons.map((button) => button.textContent), ['Add sources']);
  t.is(buttons[0].getAttribute('aria-haspopup'), 'menu');
  t.is(buttons[0].getAttribute('aria-selected'), undefined);
  t.false(buttons[0].disabled);
  buttons[0].getBoundingClientRect = () => ({ left: 12, bottom: 90 });
  // Keyboard-generated clicks have no useful pointer coordinates.
  await buttons[0].dispatch('click', { detail: 0 });
  t.deepEqual(menu.position, { x: 12, y: 90 });
  t.deepEqual(menu.entries.map(({ title, icon }) => ({ title, icon })), [
    { title: 'Notes', icon: 'file' }, { title: 'Folders', icon: 'folder' },
  ]);
  t.false(fixture.calls.some((call) => call[0] === 'suggestions'));
  menu.entries[1].run();
  const call = fixture.calls.at(-1);
  t.is(call[0], 'suggestions');
  t.is(call[1], fixture.ctx);
  t.deepEqual(call[2], { source_mode: 'context_suggest_folders', event_source: 'context_builder_view.add' });
  const primary = fixture.renders.find((entry) => entry.key === 'smart_context_builder_primary_control');
  primary.params.on_add_sources();
  t.is(fixture.calls.at(-1)[1], fixture.ctx);
  t.is(fixture.calls.at(-1)[2].source_mode, undefined);
  t.true(container.querySelector('.sc-context-builder-origin-undo').hidden);
});

test.serial('review menu preserves final configured source modes and rejects stale callbacks', async (t) => {
  const fixture = create_builder_fixture(t, { is_pro: true });
  const menu = capture_source_menu(t);
  fixture.env.resolve_menu_actions = () => [
    { action_key: 'context_suggest_external_files', title: 'External files', icon: 'folder' },
    { action_key: 'context_suggest_media', title: 'Media', icon: 'image' },
    { action_key: 'disabled', title: 'Disabled', disabled: true },
    { action_key: 'menu_only', title: 'Menu only', menu_only: true },
  ];
  let disposed = false;
  const container = await mount_builder(fixture, { surface: 'context_builder_view', is_disposed: () => disposed });
  const button = container.querySelector('.sc-context-builder-view-add');
  button.getBoundingClientRect = () => ({ left: 1, bottom: 2 });
  await button.dispatch('click');
  t.deepEqual(menu.entries.map((entry) => entry.title), ['External files', 'Media']);
  menu.entries[0].run();
  t.is(fixture.calls.at(-1)[2].source_mode, 'context_suggest_external_files');
  const call_count = fixture.calls.length;
  disposed = true;
  menu.entries[1].run();
  await button.dispatch('click');
  t.is(fixture.calls.length, call_count);
  t.is(menu.entries.length, 2);
});

test.serial('review Add sources is disabled when there are no eligible source modes', async (t) => {
  const fixture = create_builder_fixture(t);
  fixture.env.resolve_menu_actions = () => [{ title: 'Hidden', disabled: true }];
  const container = await mount_builder(fixture, { surface: 'context_builder_view' });
  t.true(container.querySelector('.sc-context-builder-view-add').disabled);
});

test.serial('review uses its surface flag and ordinary CSS imports, without runtime style injection', async (t) => {
  const fixture = create_builder_fixture(t);
  const styles = [];
  fixture.smart_view.apply_style_sheet = (style) => styles.push(style);
  // Isolate the parent: existing child components still have legacy style calls.
  const original = fixture.env.smart_components.render_component;
  fixture.env.smart_components.render_component = async (key, ctx, params) => key === 'smart_context_builder_view_header'
    ? original(key, ctx, params)
    : null
  ;
  const review = await render.call(fixture.smart_view, fixture.ctx, { surface: 'context_builder_view' });
  fixture.doc.body.appendChild(review);
  t.true(review.classList.contains('sc-context-builder-view'));
  t.is(styles.length, 0);
  const modal = await render.call(fixture.smart_view, fixture.ctx, { is_disposed: () => true });
  fixture.doc.body.appendChild(modal);
  t.false(modal.classList.contains('sc-context-builder-view'));
  t.is(styles.length, 0);
});

test.serial('modal tabs, search, undo and refreshed origin retain their existing behavior', async (t) => {
  const fixture = create_builder_fixture(t);
  const modal = {
    origin: { kind: 'active_note', source_path: 'a.md' },
    has_undoable_origin_seed: true,
    source_modes: [{ action_key: 'notes', label: 'Notes', icon: 'file' }],
    active_source_mode: 'notes',
    active_source_mode_meta: { description: 'Notes description' },
    set_builder_chrome_refresh(callback) { this.refresh = callback; },
    clear_builder_chrome_refresh(callback) { if (this.refresh === callback) this.refresh = null; },
    set_active_source_mode(key) { this.selected_mode = key; },
    focus_search() { this.focused = true; },
    undo_origin_seed() { this.origin = { kind: 'preselected' }; this.refresh(); },
  };
  const container = await mount_builder(fixture, { modal });
  const button = container.querySelector('.sc-context-builder-source-mode');
  t.is(container.querySelector('.sc-context-builder-source-nav').parentElement, container);
  t.is(container.querySelector('.sc-context-builder-description-preview'), null);
  t.is(button.getAttribute('role'), 'tab');
  t.is(button.getAttribute('aria-selected'), 'true');
  await button.dispatch('click');
  t.is(modal.selected_mode, 'notes');
  fixture.renders.find((entry) => entry.key === 'smart_context_builder_primary_control').params.on_add_sources();
  t.true(modal.focused);
  await container.querySelector('.sc-context-builder-origin-undo').dispatch('click');
  t.is(container.querySelector('.sc-context-builder-origin').textContent, 'Review context');
  container.remove();
  t.is(modal.refresh, null);
});

test.serial('shared Context rename refreshes both Builder name fields without replacing the trees', async (t) => {
  const fixture = create_builder_fixture(t);
  const first = await mount_builder(fixture);
  const second = await mount_builder(fixture);
  fixture.ctx.data.name = 'Named';
  fixture.ctx.emit_event('context:named');
  t.is(first.querySelector('input').value, 'Named');
  t.is(second.querySelector('input').value, 'Named');
  const input = first.querySelector('input');
  input.focus();
  input.value = 'Editing';
  fixture.ctx.data.name = 'Renamed';
  fixture.ctx.emit_event('context:renamed');
  t.is(first.querySelector('input'), input);
  t.is(input.value, 'Editing');
  t.is(second.querySelector('input').value, 'Renamed');
  t.is(fixture.renders.filter((entry) => entry.key === 'smart_context_builder_tree').length, 2);
});

test.serial('review component render waits for configured child components before reporting readiness', async (t) => {
  const fixture = create_builder_fixture(t);
  const pending = deferred();
  const original = fixture.env.smart_components.render_component;
  let completed = false;
  fixture.env.smart_components.render_component = async (key, ctx, params) => {
    if (key === 'smart_context_rules_list') await pending.promise;
    return original(key, ctx, params);
  };
  const rendering = render.call(fixture.smart_view, fixture.ctx, { surface: 'context_builder_view' });
  rendering.then(() => { completed = true; });
  await fixture.settle();
  t.false(completed);
  pending.resolve();
  const builder = await rendering;
  t.true(completed);
  t.truthy(builder.querySelector('.sc-context-builder-source-mode'));
  fixture.doc.body.appendChild(builder);
});

test.serial('failed review initialization rejects and arranges disposal of its already-created children', async (t) => {
  const fixture = create_builder_fixture(t);
  const original = fixture.env.smart_components.render_component;
  fixture.env.smart_components.render_component = async (key, ctx, params) => {
    if (key === 'smart_context_rules_list') throw new Error('rules failed');
    return original(key, ctx, params);
  };
  await t.throwsAsync(() => render.call(fixture.smart_view, fixture.ctx, { surface: 'context_builder_view' }), { message: 'rules failed' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  t.is(fixture.listeners.get('context:updated').size, 0);
});

test.serial('cancelled review initialization does not start hydration or subscriptions', async (t) => {
  const fixture = create_builder_fixture(t);
  const builder = await render.call(fixture.smart_view, fixture.ctx, { surface: 'context_builder_view', is_disposed: () => true });
  t.is(fixture.renders.length, 0);
  t.is(fixture.listeners.get('context:updated')?.size || 0, 0);
  fixture.doc.body.appendChild(builder);
});


test('view header is discovered as a versioned Smart View component', (t) => {
  const loader = new ComponentsLoader({ dist_dir: process.cwd() });
  loader.scan_root(fileURLToPath(new URL('../../', import.meta.url)));
  t.true(Object.hasOwn(loader.components_config, 'smart_context_builder'));
  t.true(Object.hasOwn(loader.components_config, 'smart_context_builder_view_header'));
  t.true(loader.build_imports().includes('render as smart_context_builder_view_header_component'));
  t.true(loader.build_config().includes('smart_context_builder_view_header: { render: smart_context_builder_view_header_component, version: smart_context_builder_view_header_component_version }'));
});


test.serial('review composition awaits the registered header and uses the final configured render', async (t) => {
  const fixture = create_builder_fixture(t);
  const pending = deferred();
  const original = fixture.env.smart_components.render_component;
  let header;
  const params = { surface: 'context_builder_view', event_source: 'test.override' };
  fixture.env.smart_components.render_component = async (key, ctx, options) => {
    if (key !== 'smart_context_builder_view_header') return original(key, ctx, options);
    t.is(ctx, fixture.ctx);
    t.is(options.event_source, params.event_source);
    await pending.promise;
    header = await original(key, ctx, options);
    header.dataset.configuredOverride = 'true';
    return header;
  };
  const rendering = render.call(fixture.smart_view, fixture.ctx, params);
  await fixture.settle();
  t.is(fixture.renders.length, 0);
  pending.resolve();
  const container = await rendering;
  fixture.doc.body.appendChild(container);
  t.is(container.querySelector('.sc-context-builder-header'), header);
  t.is(container.querySelectorAll('.sc-context-builder-source-nav').length, 1);
  t.is(header.querySelector('.sc-context-builder-source-nav').parentElement,
    header.querySelector('.sc-context-builder-view-meta'));
  t.is(fixture.renders[0].key, 'smart_context_builder_view_header');

  fixture.renders.length = 0;
  const modal = await mount_builder(fixture);
  t.false(fixture.renders.some(({ key }) => key === 'smart_context_builder_view_header'));
  t.is(modal.querySelector('.sc-context-builder-description-preview'), null);
});

test.serial('late header initialization is disposed without mounting more review children', async (t) => {
  const fixture = create_builder_fixture(t);
  const pending = deferred();
  const original = fixture.env.smart_components.render_component;
  let header;
  let disposed = false;
  fixture.env.smart_components.render_component = async (key, ctx, params) => {
    header = await original(key, ctx, params);
    await pending.promise;
    return header;
  };
  const rendering = render.call(fixture.smart_view, fixture.ctx, {
    surface: 'context_builder_view', is_disposed: () => disposed,
  });
  await fixture.settle();
  t.truthy(header);
  disposed = true;
  pending.resolve();
  const container = await rendering;
  fixture.doc.body.appendChild(container);
  await new Promise((resolve) => setTimeout(resolve, 5));
  t.false(container.contains(header));
  t.deepEqual(fixture.renders.map(({ key }) => key), ['smart_context_builder_view_header']);
  t.is(fixture.listeners.get('context:updated').size, 0);
});

test.serial('failed registered header rejects review initialization before hydration', async (t) => {
  const fixture = create_builder_fixture(t);
  fixture.env.smart_components.render_component = async (key) => {
    t.is(key, 'smart_context_builder_view_header');
    throw new Error('header failed');
  };
  await t.throwsAsync(() => render.call(fixture.smart_view, fixture.ctx, {
    surface: 'context_builder_view',
  }), { message: 'header failed' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  t.is(fixture.listeners.get('context:updated')?.size || 0, 0);
  t.is(fixture.renders.length, 0);
});
