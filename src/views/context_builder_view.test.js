import test from 'ava';
import { SmartContext } from 'obsidian-smart-env/src/items/smart_context.js';
import { context_add_items } from 'obsidian-smart-env/src/actions/context/add_items.js';
import { SMART_DRAG_DATA_TYPE, write_smart_drag_data } from 'obsidian-smart-env/src/utils/smart_drag_drop.js';
import { ContextBuilderView, CONTEXT_BUILDER_VIEW_TYPE } from './context_builder_view.js';
import { create_builder_fixture, deferred } from '../test_support/context_builder.js';
import { render as render_summary } from '../components/smart-context/builder_summary.js';

const open_view = (fixture, ctx = fixture.ctx, params = {}) => ContextBuilderView.open(
  fixture.workspace, { smart_context: ctx, ...params },
);

test.serial('review view binds the exact unnamed Context and composes the configured review components', async (t) => {
  const fixture = create_builder_fixture(t, { is_pro: true });
  // Live identity must not depend on finding an already-persisted row.
  fixture.contexts.delete(fixture.ctx.key);
  const view = await open_view(fixture);
  t.is(view.smart_context, fixture.ctx);
  t.is(view.getViewType(), CONTEXT_BUILDER_VIEW_TYPE);
  t.true(view.builder.classList.contains('sc-context-builder-view'));
  t.deepEqual(fixture.renders.map((entry) => entry.key), [
    'smart_context_builder', 'smart_context_builder_view_header', 'smart_context_builder_tree', 'smart_context_rules_list',
    'smart_context_builder_summary', 'smart_context_builder_primary_control',
  ]);
  t.true(fixture.renders.every((entry) => entry.ctx === fixture.ctx));
  t.true(fixture.renders.every((entry) => entry.params.surface === 'context_builder_view'));
  t.true(fixture.renders.every((entry) => !Object.hasOwn(entry.params, 'view')));
  t.true(fixture.calls.includes('right'));
  t.true(fixture.calls.includes('deferred_load'));
  t.false(fixture.calls.some((call) => call[0] === 'suggestions'));
});

test.serial('reopening the same Context reuses the view and mounted tree with its review position', async (t) => {
  const fixture = create_builder_fixture(t);
  const view = await open_view(fixture);
  const builder = view.builder;
  const tree = fixture.renders.find((entry) => entry.key === 'smart_context_builder_tree');
  builder.querySelector('.sc-context-builder-review').scrollTop = 87;
  t.is(await open_view(fixture), view);
  t.is(view.builder, builder);
  t.is(fixture.renders.filter((entry) => entry.key === tree.key).length, 1);
  t.deepEqual(view.getState(), { context_key: fixture.ctx.key, scroll_top: 87 });
  t.is(fixture.calls.filter((call) => call === 'right').length, 1);
});

test.serial('switching Contexts replaces only the review surface and removes the old subscriptions', async (t) => {
  const fixture = create_builder_fixture(t);
  const view = await open_view(fixture);
  const previous = view.builder;
  const second = fixture.create_context('second', { name: 'Second' });
  const count_before = fixture.listeners.get('context:updated').size;
  previous.querySelector('.sc-context-builder-review').scrollTop = 50;
  t.is(await open_view(fixture, second), view);
  t.is(view.smart_context, second);
  t.false(previous.isConnected);
  t.is(fixture.listeners.get('context:updated').size, count_before);
  t.is(view.getState().scroll_top, 0);
  fixture.ctx.deleted = true;
  fixture.ctx.emit_event('context:deleted');
  t.is(view.smart_context, second);
  t.is(view.builder.querySelector('input').value, 'Second');
});

test.serial('view restoration stores only identity and scroll, and deleted Contexts do not resurrect', async (t) => {
  const fixture = create_builder_fixture(t);
  const view = await open_view(fixture);
  await view.setState({ context_key: fixture.ctx.key, scroll_top: 12, context_items: { private: true } }, {});
  t.deepEqual(Object.keys(view.getState()), ['context_key', 'scroll_top']);
  fixture.ctx.deleted = true;
  fixture.ctx.emit_event('context:deleted');
  await fixture.settle();
  t.is(view.smart_context, null);
  t.is(view.builder, null);
  t.regex(view.container.children[0].textContent, /unavailable/);
  await view.setState({ context_key: 'missing', scroll_top: 33 }, {});
  t.is(view.smart_context, null);
  t.deepEqual(view.getState(), { context_key: 'missing', scroll_top: 33 });
  t.is(fixture.listeners.get('context:updated').size, 0);
});

test.serial('a restored named Context resolves by key and restores its review scroll', async (t) => {
  const fixture = create_builder_fixture(t, { data: { name: 'Saved review' } });
  const view = await ContextBuilderView.open(fixture.workspace, {
    state: { context_key: fixture.ctx.key, scroll_top: 42 },
  });
  t.is(view.smart_context, fixture.ctx);
  t.is(view.getState().scroll_top, 42);
  t.is(view.builder.querySelector('input').value, 'Saved review');
});

test.serial('review source opening focuses a document leaf and preserves the original event', async (t) => {
  const fixture = create_builder_fixture(t);
  const source_leaf = fixture.workspace.getLeaf('tab');
  fixture.workspace.setActiveLeaf(source_leaf, { focus: true });
  const view = await open_view(fixture);
  const event = { ctrlKey: true, altKey: true };
  const item = fixture.ctx.context_items.filter()[0];
  await view.open_item(item, event);
  const active = fixture.calls.filter((call) => call[0] === 'active').at(-1);
  t.is(active[1], source_leaf);
  t.deepEqual(active[2], { focus: true });
  t.deepEqual(fixture.calls.at(-1), ['source', 'a.md', event]);
  t.truthy(view.builder);
});

test.serial('mobile review uses a reusable document tab and never replaces itself with a source', async (t) => {
  const fixture = create_builder_fixture(t, { mobile: true });
  const view = await open_view(fixture);
  t.false(fixture.calls.includes('right'));
  t.false(fixture.calls.includes('expand'));
  t.is(fixture.workspace.recent, view.leaf);
  await view.open_item(fixture.ctx.context_items.filter()[0], {});
  t.not(fixture.workspace.recent, view.leaf);
  t.is(await open_view(fixture), view);
  t.truthy(view.builder);
  t.is(fixture.leaves.length, 2);
});

test.serial('closing during review rendering disposes the late surface without mounting it', async (t) => {
  const fixture = create_builder_fixture(t);
  const view = await open_view(fixture);
  const pending = deferred();
  const late = fixture.builder_element();
  const second = fixture.create_context('second');
  fixture.env.smart_components.render_component = () => pending.promise;
  view.smart_context = second;
  const rendering = view.render_view();
  await view.onClose();
  pending.resolve(late);
  t.false(await rendering);
  t.is(late.dataset.contextBuilderDisposed, 'true');
  t.is(view.builder, null);
  t.is(view.container.children.length, 0);
  t.false(await view.render_view());
});

test.serial('late render completion cannot replace a newer Context surface', async (t) => {
  const fixture = create_builder_fixture(t);
  const view = await open_view(fixture);
  const pending = deferred();
  const render_component = fixture.env.smart_components.render_component;
  const delayed_ctx = fixture.create_context('delayed');
  const next_ctx = fixture.create_context('next');
  fixture.env.smart_components.render_component = (key, ctx, params) => {
    if (key === 'smart_context_builder' && ctx === delayed_ctx) return pending.promise;
    return render_component(key, ctx, params);
  };
  view.smart_context = delayed_ctx;
  const delayed_render = view.render_view();
  view.smart_context = next_ctx;
  t.true(await view.render_view());
  const next_builder = view.builder;
  pending.resolve(fixture.builder_element());
  t.false(await delayed_render);
  t.is(view.builder, next_builder);
  t.is(view.smart_context, next_ctx);
});

test.serial('render failure remains visible and retry can use the same Context', async (t) => {
  const fixture = create_builder_fixture(t);
  const render_component = fixture.env.smart_components.render_component;
  fixture.env.smart_components.render_component = () => { throw new Error('render failed'); };
  t.is(await open_view(fixture), null);
  const view = fixture.leaves[0].view;
  t.regex(view.container.children[0].textContent, /could not render/);
  t.is(view.builder, null);
  t.true(fixture.notifications.length > 0);
  fixture.env.smart_components.render_component = render_component;
  t.true(await view.render_view());
  t.is(view.smart_context, fixture.ctx);
  t.truthy(view.builder);
});

test.serial('close during initialization prevents later DOM and hover registrations', async (t) => {
  const fixture = create_builder_fixture(t);
  const view = await open_view(fixture);
  const pending = deferred();
  view.initializing = null;
  view.render_mobile_status_bar = () => pending.promise;
  const initializing = view.initialize();
  await fixture.settle();
  await view.onClose();
  const count = fixture.calls.filter((call) => call === 'register_hover').length;
  pending.resolve();
  await initializing;
  t.is(fixture.calls.filter((call) => call === 'register_hover').length, count);
  t.is(view.container.children.length, 0);
});

test.serial('closed view rejects source navigation and repeated close leaves no Context subscriptions', async (t) => {
  const fixture = create_builder_fixture(t);
  const view = await open_view(fixture);
  await view.onClose();
  const count = fixture.calls.length;
  t.false(await view.open_item(fixture.ctx.context_items.filter()[0], {}));
  t.is(fixture.calls.length, count);
  await view.onClose();
  for (const key of ['context:updated', 'context:deleted', 'context:named', 'context:renamed']) {
    t.is(fixture.listeners.get(key)?.size || 0, 0);
  }
});

test.serial('a later open supersedes a slow earlier request instead of returning the wrong Context', async (t) => {
  const fixture = create_builder_fixture(t);
  const view = await open_view(fixture);
  const pending = deferred();
  const second = fixture.create_context('second');
  const third = fixture.create_context('third');
  const render_component = fixture.env.smart_components.render_component;
  fixture.env.smart_components.render_component = (key, ctx, params) => {
    if (key === 'smart_context_builder' && ctx === second) return pending.promise;
    return render_component(key, ctx, params);
  };
  const earlier = open_view(fixture, second);
  await fixture.settle();
  t.is(await open_view(fixture, third), view);
  pending.resolve(fixture.builder_element());
  t.is(await earlier, null);
  t.is(view.smart_context, third);
  t.is(view.getState().context_key, 'third');
});

test.serial('same-Context view state restoration updates the mounted scroll without rerendering', async (t) => {
  const fixture = create_builder_fixture(t);
  const view = await open_view(fixture);
  const builder = view.builder;
  await view.setState({ context_key: fixture.ctx.key, scroll_top: 73 }, {});
  t.is(view.builder, builder);
  t.is(view.getState().scroll_top, 73);
});

function data_transfer(data = {}) {
  return {
    data: { ...data }, files: [],
    get types() { return Object.keys(this.data); },
    getData(type) { return this.data[type] || ''; },
    setData(type, value) { this.data[type] = value; },
  };
}

/** Real shared native/Smart resolver and Core add mutation; no filesystem IO. */
function prepare_drop(fixture, ctx = fixture.ctx) {
  const items = Object.fromEntries(['Projects/Alpha.md', 'Projects/Nested/Beta.md', 'ProjectsExtra/Other.md'].map((key) => [key, {
    key, collection_key: 'smart_sources',
  }]));
  fixture.env.smart_sources = {
    items,
    fs: { base_path: '/vault', file_paths: [...Object.keys(items), 'Images/Diagram.png', 'Files/Reference.pdf'], folder_paths: ['Projects', 'Projects/Nested', 'ProjectsExtra'] },
    get(key) { return items[key]; },
    filter({ key_starts_with }) { return Object.values(items).filter((item) => item.key.startsWith(key_starts_with)); },
  };
  fixture.env.smart_blocks = { get(key) {
    return key === 'Projects/Alpha.md#Heading' ? { key, collection_key: 'smart_blocks' } : null;
  } };
  ctx.add_item = SmartContext.prototype.add_item;
  ctx.add_items = SmartContext.prototype.add_items;
  const additions = [];
  ctx.actions.context_add_items = (params) => {
    additions.push(params);
    return context_add_items.call(ctx, params);
  };
  return additions;
}

test.serial('native navigator file/URI batches add once through the configured action and refresh the same view', async (t) => {
  const fixture = create_builder_fixture(t, { data: { context_items: {} } });
  const additions = prepare_drop(fixture);
  const original_render = fixture.env.smart_components.render_component;
  fixture.env.smart_components.render_component = (key, ctx, params) => key === 'smart_context_builder_summary'
    ? render_summary.call(fixture.smart_view, ctx, params)
    : original_render(key, ctx, params)
  ;
  const view = await open_view(fixture);
  const builder = view.builder;
  t.false(builder.querySelector('.sc-context-builder-empty').hidden);
  const transfer = data_transfer({
    'text/plain': 'Projects/Alpha.md\nProjects/Alpha.md',
    'text/uri-list': 'obsidian://open?vault=Notes&file=Projects%2FNested%2FBeta',
  });
  let prevented = false, stopped = false;
  await builder.dispatch('drop', {
    dataTransfer: transfer,
    preventDefault() { prevented = true; }, stopPropagation() { stopped = true; },
  });
  await fixture.frame();
  t.true(prevented);
  t.true(stopped);
  t.deepEqual(additions, [{ items: ['Projects/Nested/Beta.md', 'Projects/Alpha.md'] }]);
  t.deepEqual(Object.keys(fixture.ctx.data.context_items), additions[0].items);
  t.is(view.builder, builder);
  t.truthy(builder.querySelector('[data-item-key="Projects/Alpha.md"]'));
  t.is(fixture.notifications.length, 0);
  t.true(builder.querySelector('.sc-context-builder-empty').hidden);
  t.false(builder.querySelector('.sc-context-builder-tree').hidden);
  t.is(builder.querySelector('.sc-context-builder-ui-summary').children[0].textContent, '2 sources');
});

test.serial('native folder drop expands the existing file selection contract without adding a folder rule', async (t) => {
  const fixture = create_builder_fixture(t, { is_pro: true });
  const additions = prepare_drop(fixture);
  const view = await open_view(fixture);
  await view.builder.dispatch('drop', { dataTransfer: data_transfer({ 'text/plain': 'Projects' }) });
  t.deepEqual(additions, [{ items: ['Projects/Alpha.md', 'Projects/Nested/Beta.md'] }]);
  t.false(Object.hasOwn(fixture.ctx.data.context_items, 'Projects'));
  t.false(Object.hasOwn(fixture.ctx.data.context_items, 'ProjectsExtra/Other.md'));
});

test.serial('native image/PDF paths and in-vault file-list entries keep the shared resolver behavior', async (t) => {
  const fixture = create_builder_fixture(t);
  const additions = prepare_drop(fixture);
  const view = await open_view(fixture);
  const transfer = data_transfer({ 'text/plain': 'Images/Diagram.png\nFiles/Reference.pdf' });
  transfer.files = [{ path: '/vault/Projects/Alpha.md' }];
  await view.builder.dispatch('drop', { dataTransfer: transfer });
  t.deepEqual(additions[0].items, ['Projects/Alpha.md', 'Images/Diagram.png', 'Files/Reference.pdf']);
});

test.serial('Smart source/block identities take precedence over native text and deduplicate', async (t) => {
  const fixture = create_builder_fixture(t);
  const additions = prepare_drop(fixture);
  const view = await open_view(fixture);
  const transfer = data_transfer({ 'text/plain': 'ProjectsExtra/Other.md' });
  const source = fixture.env.smart_sources.get('Projects/Alpha.md');
  write_smart_drag_data(transfer, [source, source, fixture.env.smart_blocks.get('Projects/Alpha.md#Heading')]);
  await view.builder.dispatch('drop', { dataTransfer: transfer });
  t.deepEqual(additions, [{ items: ['Projects/Alpha.md', 'Projects/Alpha.md#Heading'] }]);
});

test.serial('invalid/unsupported Smart data fails closed and never falls back to native file data', async (t) => {
  const fixture = create_builder_fixture(t);
  const additions = prepare_drop(fixture);
  const view = await open_view(fixture);
  const unsupported = data_transfer({ 'text/plain': 'Projects/Alpha.md' });
  write_smart_drag_data(unsupported, { collection_key: 'smart_contexts', key: fixture.ctx.key });
  for (const transfer of [
    data_transfer({ [SMART_DRAG_DATA_TYPE]: '{bad-json', 'text/plain': 'Projects/Alpha.md' }),
    unsupported,
    data_transfer({ 'text/plain': '/outside/Projects/Alpha.md' }),
    data_transfer({ 'text/plain': 'Unknown path' }),
  ]) await view.builder.dispatch('drop', { dataTransfer: transfer });
  t.is(additions.length, 0);
  t.deepEqual(Object.keys(fixture.ctx.data.context_items), ['a.md']);
});

test.serial('drag feedback uses copy, does not read protected dragover data, and resets on leave/end/blur', async (t) => {
  const fixture = create_builder_fixture(t);
  prepare_drop(fixture);
  const view = await open_view(fixture);
  const transfer = { getData() { throw new Error('Protected until drop'); } };
  await view.builder.dispatch('dragenter', { dataTransfer: transfer });
  t.true(view.builder.classList.contains('is-drag-over'));
  t.is(transfer.dropEffect, 'copy');
  await view.builder.dispatch('dragleave', { relatedTarget: view.builder.querySelector('.sc-context-builder-review') });
  t.true(view.builder.classList.contains('is-drag-over'));
  await view.builder.dispatch('dragleave');
  t.false(view.builder.classList.contains('is-drag-over'));
  for (const event_name of ['dragend', 'blur']) {
    await view.builder.dispatch('dragover', { dataTransfer: transfer });
    await fixture.doc.defaultView.dispatch(event_name);
    t.false(view.builder.classList.contains('is-drag-over'));
  }
});

test.serial('dropping into name or description editors keeps native editing and never mutates membership', async (t) => {
  const fixture = create_builder_fixture(t);
  const additions = prepare_drop(fixture);
  const view = await open_view(fixture);
  for (const selector of ['.sc-context-name-input', '.sc-context-builder-description-input', '.sc-context-builder-description-actions']) {
    let prevented = false;
    const target = view.builder.querySelector(selector);
    const event = { target, dataTransfer: data_transfer({ 'text/plain': 'Projects/Alpha.md' }), preventDefault() { prevented = true; } };
    await view.builder.dispatch('dragover', event);
    await view.builder.dispatch('drop', event);
    t.false(prevented);
    t.false(view.builder.classList.contains('is-drag-over'));
  }
  t.is(additions.length, 0);
});

test.serial('failed add actions report errors without inventing rollback or leaving drag feedback', async (t) => {
  const fixture = create_builder_fixture(t);
  prepare_drop(fixture);
  const view = await open_view(fixture);
  fixture.ctx.actions.context_add_items = async ({ items }) => {
    fixture.ctx.add_item(items[0]);
    throw new Error('Partial write failure');
  };
  const transfer = data_transfer({ 'text/plain': 'Projects/Alpha.md\nProjects/Nested/Beta.md' });
  await view.builder.dispatch('dragenter', { dataTransfer: transfer });
  await view.builder.dispatch('drop', { dataTransfer: transfer });
  await fixture.frame();
  t.false(view.builder.classList.contains('is-drag-over'));
  t.truthy(fixture.ctx.data.context_items['Projects/Alpha.md']);
  t.falsy(fixture.ctx.data.context_items['Projects/Nested/Beta.md']);
  t.is(fixture.notifications.at(-1).event_source, 'context_builder_view.drop');
  t.is(fixture.notifications.at(-1).details, 'Partial write failure');
  t.truthy(view.builder.querySelector('[data-item-key="Projects/Alpha.md"]'));
});

test.serial('closing or switching views removes drop handlers, window listeners and stale mutation callbacks', async (t) => {
  const fixture = create_builder_fixture(t);
  const additions = prepare_drop(fixture);
  const view = await open_view(fixture);
  const previous = view.builder;
  const stale_drop = [...previous.listeners.get('drop')][0];
  await open_view(fixture); // reuse must not duplicate handlers
  t.is(previous.listeners.get('drop').size, 1);
  const second = fixture.create_context('second');
  const second_additions = prepare_drop(fixture, second);
  await open_view(fixture, second);
  t.is(previous.listeners.get('drop').size, 0);
  t.is(fixture.doc.defaultView.listeners.get('blur').size, 1);
  const event = { target: previous, dataTransfer: data_transfer({ 'text/plain': 'Projects/Alpha.md' }) };
  await stale_drop(event);
  t.is(additions.length, 0);
  const mounted = view.builder;
  await mounted.dispatch('drop', { dataTransfer: event.dataTransfer });
  t.is(second_additions.length, 1);
  await view.onClose();
  t.is(mounted.listeners.get('drop').size, 0);
  t.is(fixture.doc.defaultView.listeners.get('blur').size, 0);
  t.is(fixture.doc.defaultView.listeners.get('dragend').size, 0);
});

test.serial('an accepted asynchronous drop remains bound to the originating Context across a switch', async (t) => {
  const fixture = create_builder_fixture(t);
  prepare_drop(fixture);
  const pending = deferred();
  fixture.ctx.actions.context_add_items = async (params) => {
    await pending.promise;
    context_add_items.call(fixture.ctx, params);
  };
  const view = await open_view(fixture);
  const dropping = view.builder.dispatch('drop', { dataTransfer: data_transfer({ 'text/plain': 'Projects/Alpha.md' }) });
  const second = fixture.create_context('second');
  await open_view(fixture, second);
  pending.resolve();
  await dropping;
  t.truthy(fixture.ctx.data.context_items['Projects/Alpha.md']);
  t.falsy(second.data.context_items['Projects/Alpha.md']);
  t.is(view.smart_context, second);
});
