import test from 'ava';
import { post_process } from './builder.js';
import { build_html, render, post_process as post_process_header } from './builder_view_header.js';
import { create_builder_fixture, deferred } from '../../test_support/context_builder.js';

async function mount_header(fixture) {
  const container = fixture.builder_element({ surface: 'context_builder_view' });
  fixture.doc.body.appendChild(container);
  await post_process.call(fixture.smart_view, fixture.ctx, container, { surface: 'context_builder_view' });
  return {
    container,
    header: container.querySelector('.sc-context-builder-header'),
    preview: container.querySelector('.sc-context-builder-description-preview'),
    editor: container.querySelector('.sc-context-builder-description-editor'),
    input: container.querySelector('.sc-context-builder-description-input'),
    cancel: container.querySelector('.sc-context-builder-description-actions').children[0],
    save: container.querySelector('.sc-context-builder-description-actions').children[1],
  };
}

test.serial('review header reuses name, summary and actions and exposes safe description text', async (t) => {
  const description = '<b>Literal text</b>\nUse for source review';
  const fixture = create_builder_fixture(t, { data: { name: 'Review', description } });
  const ui = await mount_header(fixture);
  t.is(ui.preview.textContent, description);
  t.is(ui.preview.title, description);
  t.is(ui.preview.children.length, 0);
  t.is(ui.preview.getAttribute('aria-label'), 'Edit context description');
  t.is(ui.preview.getAttribute('aria-expanded'), 'false');
  t.true(ui.editor.hidden);
  t.is(ui.header.querySelector('.sc-context-builder-summary').parentElement, ui.header.querySelector('.sc-context-builder-view-meta'));
  t.is(ui.header.querySelector('.sc-context-builder-source-nav').parentElement, ui.header.querySelector('.sc-context-builder-view-meta'));
  t.is(ui.container.querySelector('.sc-context-name-input').value, 'Review');
  t.truthy(ui.header.querySelector('.sc-context-builder-primary'));
});

test.serial('description edits use registered persistence, trim values and restore focus on save', async (t) => {
  const fixture = create_builder_fixture(t, { data: { description: 'Original' } });
  const updates = [];
  fixture.ctx.actions.context_update = async (params) => {
    updates.push(params);
    fixture.ctx.data.description = params.description;
    fixture.ctx.emit_event('context:updated');
  };
  const ui = await mount_header(fixture);
  await ui.preview.dispatch('click');
  t.is(ui.input.value, 'Original');
  t.is(fixture.doc.activeElement, ui.input);
  t.false(ui.editor.hidden);
  t.true(ui.preview.hidden);
  ui.input.value = '  New purpose\nWith details  ';
  await ui.save.dispatch('click');
  t.deepEqual(updates, [{ description: 'New purpose\nWith details', event_source: 'context_builder_view.description' }]);
  t.true(ui.editor.hidden);
  t.false(ui.preview.hidden);
  t.is(ui.preview.textContent, 'New purpose\nWith details');
  t.is(fixture.doc.activeElement, ui.preview);
  t.false(ui.save.disabled);
});

test.serial('Core description fallback saves on Ctrl/Cmd Enter and allows clearing', async (t) => {
  const fixture = create_builder_fixture(t);
  const ui = await mount_header(fixture);
  t.is(ui.preview.textContent, 'Add description');
  for (const modifier of ['ctrlKey', 'metaKey']) {
    await ui.preview.dispatch('click');
    ui.input.value = modifier === 'ctrlKey' ? 'A purpose' : '   ';
    let prevented = false;
    await ui.input.dispatch('keydown', { key: 'Enter', [modifier]: true, preventDefault() { prevented = true; } });
    await fixture.settle();
    t.true(prevented);
    t.true(ui.editor.hidden);
  }
  t.is(fixture.ctx.data.description, '');
  t.is(ui.preview.textContent, 'Add description');
  t.is(fixture.calls.filter((call) => call[0] === 'save_context').length, 2);
});

test.serial('Escape and Cancel discard drafts, plain Enter and IME never save', async (t) => {
  const fixture = create_builder_fixture(t, { data: { description: 'Saved' } });
  const ui = await mount_header(fixture);
  await ui.preview.dispatch('click');
  ui.input.value = 'Draft';
  await ui.input.dispatch('keydown', { key: 'Enter' });
  await ui.input.dispatch('keydown', { key: 'Enter', metaKey: true, isComposing: true });
  t.false(ui.editor.hidden);
  t.is(fixture.ctx.data.description, 'Saved');
  await ui.input.dispatch('keydown', { key: 'Escape' });
  t.true(ui.editor.hidden);
  t.is(ui.input.value, 'Saved');
  await ui.preview.dispatch('click');
  ui.input.value = 'Another draft';
  await ui.cancel.dispatch('click');
  t.true(ui.editor.hidden);
  t.is(ui.preview.textContent, 'Saved');
  t.is(fixture.calls.filter((call) => call[0] === 'save_context').length, 0);
});

test.serial('Context updates refresh previews without replacing unsaved description drafts or trees', async (t) => {
  const fixture = create_builder_fixture(t, { data: { description: 'Before' } });
  const first = await mount_header(fixture);
  const second = await mount_header(fixture);
  await first.preview.dispatch('click');
  first.input.value = 'Draft';
  const tree = first.container.querySelector('.sc-context-builder-tree');
  fixture.ctx.data.description = 'External update';
  fixture.ctx.emit_event('context:updated');
  t.is(first.input.value, 'Draft');
  t.is(second.preview.textContent, 'External update');
  t.is(second.input.value, 'External update');
  t.is(first.container.querySelector('.sc-context-builder-tree'), tree);
  await first.cancel.dispatch('click');
  t.is(first.preview.textContent, 'External update');
});

test.serial('description save failure keeps the draft and supports retry without double writes', async (t) => {
  const fixture = create_builder_fixture(t, { data: { description: 'Original' } });
  const pending = deferred();
  let writes = 0;
  fixture.ctx.actions.context_update = async (params) => {
    writes += 1;
    await pending.promise;
    fixture.ctx.data.description = params.description;
  };
  const ui = await mount_header(fixture);
  await ui.preview.dispatch('click');
  ui.input.value = 'Retry this';
  const saving = ui.save.dispatch('click');
  t.true(ui.input.disabled);
  t.is(ui.editor.getAttribute('aria-busy'), 'true');
  await ui.save.dispatch('click');
  await ui.input.dispatch('keydown', { key: 'Escape' });
  t.is(writes, 1);
  pending.reject(new Error('Save failed'));
  await saving;
  t.false(ui.editor.hidden);
  t.is(ui.input.value, 'Retry this');
  t.false(ui.input.disabled);
  t.is(fixture.doc.activeElement, ui.input);
  t.is(fixture.notifications.at(-1).event_source, 'context_builder_view.description');
  fixture.ctx.actions.context_update = async ({ description }) => { fixture.ctx.data.description = description; };
  await ui.save.dispatch('click');
  t.true(ui.editor.hidden);
  t.is(fixture.ctx.data.description, 'Retry this');
});

test.serial('disposed review header drops subscriptions and ignores stale edits or late focus', async (t) => {
  const fixture = create_builder_fixture(t);
  const pending = deferred();
  let writes = 0;
  fixture.ctx.actions.context_update = async () => { writes += 1; await pending.promise; };
  const ui = await mount_header(fixture);
  await ui.preview.dispatch('click');
  ui.input.value = 'Pending';
  const saving = ui.save.dispatch('click');
  ui.container.remove();
  fixture.doc.activeElement = null;
  pending.resolve();
  await saving;
  await ui.preview.dispatch('click');
  await ui.save.dispatch('click');
  t.is(writes, 1);
  t.is(fixture.doc.activeElement, null);
  t.is(fixture.listeners.get('context:updated').size, 0);
});


test.serial('review branding and drop guidance remain local to the mounted review header', async (t) => {
  const fixture = create_builder_fixture(t, { data: { context_items: {} } });
  const ui = await mount_header(fixture);
  const brand = ui.header.querySelector('.sc-context-builder-view-brand');
  t.is(brand.textContent, 'Smart Context');
  t.is(brand.parentElement, ui.header.querySelector('.sc-context-builder-primary'));
  t.is(brand.tagName, 'div');
  t.is(ui.container.querySelector('.sc-context-builder-empty-title').textContent, 'Add sources to this context');
  t.is(ui.container.querySelector('.sc-context-builder-empty-description').textContent.trim(),
    'Drop notes or folders here, or use Add sources above. Review the sources before copying.');
  fixture.ctx.emit_event('context:updated');
  t.is(ui.header.querySelectorAll('.sc-context-builder-view-brand').length, 1);
  t.is(ui.header.querySelector('.sc-context-builder-view-brand'), brand);
  t.is(fixture.calls.filter((call) => call[0] === 'save_context').length, 0);

  const modal_container = fixture.builder_element();
  fixture.doc.body.appendChild(modal_container);
  const empty_title = modal_container.querySelector('.sc-context-builder-empty-title');
  const empty_description = modal_container.querySelector('.sc-context-builder-empty-description');
  // Seed custom modal copy to check that composition leaves it untouched.
  empty_title.textContent = 'Start with useful evidence';
  empty_description.textContent = 'Original modal guidance';
  await post_process.call(fixture.smart_view, fixture.ctx, modal_container, {
    modal: { source_modes: [], set_builder_chrome_refresh() {}, clear_builder_chrome_refresh() {} },
  });
  t.is(modal_container.querySelector('.sc-context-builder-view-brand'), null);
  t.is(empty_title.textContent, 'Start with useful evidence');
  t.is(empty_description.textContent, 'Original modal guidance');
});


test('header build_html contains only static markup and supports independent fragment creation', (t) => {
  const html = build_html();
  t.is(html, build_html());
  t.true(html.startsWith('<div class="sc-context-builder-header">'));
  t.true(html.includes('Smart Context'));
  t.true(html.includes('aria-expanded="false"'));
  t.true(html.includes('class="sc-context-builder-description-editor" hidden'));
  t.true(html.includes('aria-label="Context description"'));
  t.false(html.includes('sc-context-builder-empty'));
  t.false(html.includes('sc-context-builder-review'));
});

test.serial('header render returns its own root and post_process binds only that root', async (t) => {
  const fixture = create_builder_fixture(t, { data: { description: '<script>literal</script>' } });
  const untouched = fixture.builder_element();
  fixture.doc.body.appendChild(untouched);
  const empty_title = untouched.querySelector('.sc-context-builder-empty-title').textContent;
  const header = await render.call(fixture.smart_view, fixture.ctx);
  fixture.doc.body.appendChild(header);
  t.true(header.classList.contains('sc-context-builder-header'));
  t.is(header.querySelector('.sc-context-builder-description-preview').textContent, '<script>literal</script>');
  t.is(header.querySelector('.sc-context-builder-description-preview').children.length, 0);
  t.is(header.querySelector('.sc-context-builder-description-input').rows, 3);
  t.is(header.querySelector('.sc-context-builder-description-actions').children[0].type, 'button');
  t.is(untouched.querySelector('.sc-context-builder-empty-title').textContent, empty_title);
  t.is(untouched.querySelector('.sc-context-builder-description-preview'), null);
  t.is(fixture.renders.length, 0);
  header.remove();
  t.is(fixture.listeners.get('context:updated').size, 0);

  const fragment = fixture.smart_view.create_doc_fragment(build_html()).firstElementChild;
  t.is(post_process_header.call(fixture.smart_view, fixture.ctx, fragment), fragment);
  fixture.doc.body.appendChild(fragment);
  t.is(fragment.querySelector('.sc-context-builder-description-preview').textContent, fixture.ctx.data.description);
  fragment.remove();
  t.is(fixture.listeners.get('context:updated').size, 0);
});


test.serial('description editor owns a full-width header row after actions, before summary', async (t) => {
  const fixture = create_builder_fixture(t, { data: { description: 'Review purpose' } });
  const ui = await mount_header(fixture);
  const identity = ui.header.querySelector('.sc-context-builder-header-copy');
  t.deepEqual(Array.from(ui.header.children, (child) => child.className), [
    'sc-context-builder-header-copy',
    'sc-context-builder-primary',
    'sc-context-builder-description-editor',
    'sc-context-builder-view-meta',
  ]);
  t.is(ui.preview.parentElement, identity);
  t.false(identity.contains(ui.editor));
  t.true(ui.editor.hidden);
});

test.serial('description editing preserves mounted actions, summary and tree on open, cancel and save', async (t) => {
  const fixture = create_builder_fixture(t, { data: { description: 'Before' } });
  const ui = await mount_header(fixture);
  const primary = ui.header.querySelector('.sc-context-builder-primary');
  const summary = ui.header.querySelector('.sc-context-builder-summary');
  const tree = ui.container.querySelector('.sc-context-builder-tree');
  const rendered = fixture.renders.length;
  for (const button of [ui.cancel, ui.save]) {
    await ui.preview.dispatch('click');
    ui.input.value = 'After';
    t.true(ui.editor.parentElement === ui.header);
    t.is(ui.header.querySelector('.sc-context-builder-primary'), primary);
    t.is(ui.header.querySelector('.sc-context-builder-summary'), summary);
    t.is(ui.container.querySelector('.sc-context-builder-tree'), tree);
    await button.dispatch('click');
    t.true(ui.editor.hidden);
    t.is(fixture.doc.activeElement, ui.preview);
  }
  t.is(fixture.ctx.data.description, 'After');
  t.is(fixture.renders.length, rendered);
});
