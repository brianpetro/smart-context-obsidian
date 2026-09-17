import test from 'ava';
import { context_open_builder_view, menus } from './open_builder_view.js';
import { ContextBuilderView } from '../../views/context_builder_view.js';
import { create_builder_fixture } from '../../test_support/context_builder.js';

test.serial('review action opens the same Context and honors background handoff', async (t) => {
  const fixture = create_builder_fixture(t);
  const view = await context_open_builder_view.call(fixture.ctx, { active: false, menu_ctx: {} });
  t.is(view.smart_context, fixture.ctx);
  t.false(fixture.calls.some((call) => call[0] === 'reveal'));
  t.true(fixture.calls.includes('expand'));
  t.is(await context_open_builder_view.call(fixture.ctx), view);
  t.true(fixture.calls.some((call) => call[0] === 'reveal'));
});

test('review action menu is hidden only on the review view', (t) => {
  const menu = menus['smart_context:action_menu'];
  t.true(menu.when.call({ params: {} }));
  t.true(menu.when.call({ params: { surface: 'context_builder' } }));
  t.false(menu.when.call({ params: { surface: 'context_builder_view' } }));
});

test.serial('review action rejects a failed workspace open without claiming handoff', async (t) => {
  const fixture = create_builder_fixture(t);
  fixture.workspace.getRightLeaf = () => ({ async setViewState() { throw new Error('workspace failed'); } });
  await t.throwsAsync(() => context_open_builder_view.call(fixture.ctx), { message: 'workspace failed' });
  t.false(fixture.calls.includes('expand'));
});

test.serial('review view uses the inherited registration contract without another automatic command', (t) => {
  const fixture = create_builder_fixture(t);
  const registrations = [];
  fixture.plugin.registerView = (type, factory) => registrations.push({ type, factory });
  fixture.plugin.register = () => {};
  fixture.plugin.addCommand = () => t.fail('registration must not add a duplicate command');
  const registration = ContextBuilderView.register_item_view(fixture.plugin, { skip_command_registration: true });
  t.is(registrations.length, 1);
  t.is(registrations[0].type, 'smart-context-builder');
  t.deepEqual(registration, {
    method_name: 'context_builder', open_method_name: 'open_context_builder', event_name: 'context_builder:open',
  });
});
