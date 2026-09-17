import { Notice, Platform } from 'obsidian';
import { SmartItemView } from 'obsidian-smart-env/views/smart_item_view.js';
import { wait_for_env_to_load } from 'obsidian-smart-env/utils/wait_for_env_to_load.js';
import { dispose_unmounted_builder } from '../components/smart-context/builder.js';
import { resolve_dropped_context_item_keys } from '../utils/resolve_dropped_context_item_keys.js';

export const CONTEXT_BUILDER_VIEW_TYPE = 'smart-context-builder';
const open_requests = new WeakMap();

/** Review host only. Membership and mutations remain on the existing Context. */
export class ContextBuilderView extends SmartItemView {
  static get view_type() { return CONTEXT_BUILDER_VIEW_TYPE; }
  static get display_text() { return 'Context Builder'; }
  static get icon_name() { return 'smart-context-builder'; }

  constructor(leaf, plugin) {
    super(leaf, plugin);
    this.context_key = '';
    this.smart_context = null;
    this.builder = null;
    this.render_id = 0;
    this.scroll_top = 0;
    this.closed = false;
  }

  /** Await review readiness before handing off the modal's removal queue. */
  static async open(workspace, params = {}) {
    const open_id = (open_requests.get(workspace) || 0) + 1;
    open_requests.set(workspace, open_id);
    const existing_leaf = this.get_leaf(workspace);
    const previous_state = existing_leaf?.view.getState() || {};
    const context_key = params.smart_context?.key || params.state?.context_key
      || previous_state.context_key || '';
    const state = {
      context_key,
      scroll_top: context_key === previous_state.context_key
        ? previous_state.scroll_top || 0
        : params.state?.scroll_top || 0,
    };
    const leaf = existing_leaf || (Platform.isMobile
      ? workspace.getLeaf('tab')
      : workspace.getRightLeaf(false)
    );
    if (!leaf) throw new Error('No workspace leaf is available for Context Builder.');
    await leaf.setViewState({ type: this.view_type, active: false, state });
    await leaf.loadIfDeferred();
    if (open_requests.get(workspace) !== open_id) return null;
    const view = leaf.view;
    if (!(view instanceof this)) throw new Error('Context Builder view is unavailable.');
    // Retain object identity even for a Context which has not been persisted.
    if (params.smart_context) {
      view.context_key = params.smart_context.key;
      view.smart_context = params.smart_context;
    }
    await view.initialize();
    if (open_requests.get(workspace) !== open_id || !await view.render_view()) return null;
    if (open_requests.get(workspace) !== open_id) return null;
    if (!Platform.isMobile) workspace.rightSplit.expand();
    if (params.active !== false) await workspace.revealLeaf(leaf);
    workspace.requestSaveLayout();
    return view;
  }

  /** Persist identity and review position, never a second Context manifest. */
  getState() {
    return {
      context_key: this.context_key,
      scroll_top: this.builder?.querySelector('.sc-context-builder-review')?.scrollTop
        ?? this.scroll_top,
    };
  }

  async setState(state = {}, result) {
    const context_key = String(state.context_key || '');
    if (context_key !== this.context_key) this.smart_context = null;
    this.context_key = context_key;
    this.scroll_top = Math.max(0, Number(state.scroll_top) || 0);
    await super.setState(state, result);
    if (!this.closed && await this.render_view_when_ready() && this.context_key === context_key) {
      this.builder.querySelector('.sc-context-builder-review').scrollTop = this.scroll_top;
    }
  }

  initialize() {
    if (this.closed) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      await wait_for_env_to_load(this, { wait_for_states: ['loaded'] });
      if (this.closed) return;
      await this.render_mobile_status_bar();
      if (this.closed) return;
      this.app.workspace.registerHoverLinkSource(this.constructor.view_type, {
        display: this.getDisplayText(), defaultMod: true,
      });
      this._smart_item_view_initialized = true;
      await this.render_view();
    })();
    return this.initializing;
  }

  async render_view() {
    if (this.closed) return false;
    const ctx = this.smart_context || this.env.smart_contexts.get(this.context_key);
    if (ctx && !ctx.deleted && this.rendered_context === ctx) {
      if (this.render_promise) return this.render_promise;
      if (this.builder) return true;
    }
    this.dispose_builder();
    this.smart_context = ctx && !ctx.deleted ? ctx : null;
    this.rendered_context = this.smart_context;
    const render_id = ++this.render_id;
    this.container.replaceChildren();
    if (!this.smart_context) {
      this.container.createEl('p', {
        text: this.context_key
          ? 'This Context is unavailable. Open another Context in the Builder.'
          : 'Open a Context in the Builder to review it here.',
      });
      return false;
    }
    this.context_key = ctx.key;
    this.unsubscribe_deleted = ctx.on_event('context:deleted', () => {
      void this.render_view();
    });
    this.render_promise = this.render_builder(ctx, render_id);
    try {
      return await this.render_promise;
    } finally {
      if (render_id === this.render_id) this.render_promise = null;
    }
  }

  async render_builder(ctx, render_id) {
    const is_disposed = () => this.closed || render_id !== this.render_id;
    try {
      const builder = await this.env.smart_components.render_component(
        'smart_context_builder', ctx, {
          surface: 'context_builder_view',
          is_disposed,
          on_open_item: (context_item, event) => this.open_item(context_item, event),
        },
      );
      if (is_disposed()) {
        dispose_unmounted_builder(builder);
        return false;
      }
      if (!builder) throw new Error('Context Builder component returned no element.');
      this.builder = builder;
      builder.classList.add('sc-context-builder-view');
      this.container.replaceChildren(builder);
      this.register_drop_target(builder, ctx);
      builder.querySelector('.sc-context-builder-review').scrollTop = this.scroll_top;
      return true;
    } catch (error) {
      if (is_disposed()) return false;
      this.container.replaceChildren();
      this.container.createEl('p', { text: 'Context Builder could not render.' });
      const retry = this.container.createEl('button', { text: 'Retry' });
      retry.addEventListener('click', () => { void this.render_view(); });
      this.env.events.emit('notification:error', {
        level: 'error', message: 'Context Builder could not render.',
        details: error.message, event_source: 'context_builder_view.render',
      });
      return false;
    }
  }

  /** Keep the review leaf intact; adapters still own source-specific opening. */
  async open_item(context_item, event) {
    if (this.closed) return false;
    const workspace = this.app.workspace;
    let source_leaf = workspace.getMostRecentLeaf();
    if (!source_leaf || source_leaf === this.leaf) source_leaf = workspace.getLeaf('tab');
    workspace.setActiveLeaf(source_leaf, { focus: true });
    return context_item.open(event);
  }

  /** Use the dashboard's Smart/native drop contract and the final add action. */
  register_drop_target(builder, ctx) {
    const owner_window = builder.ownerDocument.defaultView;
    const clear_drag = () => builder.classList.remove('is-drag-over');
    const is_available = () => !this.closed && !ctx.deleted && this.builder === builder;
    const is_editor_event = (event) => Boolean(event.target?.closest?.(
      'input, textarea, [contenteditable="true"], .sc-context-builder-description-editor',
    ));
    const on_dragover = (event) => {
      if (!is_available() || is_editor_event(event)) {
        clear_drag();
        return;
      }
      event.preventDefault();
      builder.classList.add('is-drag-over');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const on_dragleave = (event) => {
      if (event.relatedTarget && builder.contains(event.relatedTarget)) return;
      clear_drag();
    };
    const on_drop = async (event) => {
      clear_drag();
      if (!is_available() || is_editor_event(event)) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        // Read only on drop: dragover data can be protected by the browser.
        const items = resolve_dropped_context_item_keys(ctx.env, event.dataTransfer);
        if (!items.length) {
          new Notice('Drop notes, folders, Connections, or Lookup results onto this Context.');
          return;
        }
        await ctx.actions.context_add_items({ items });
      } catch (error) {
        ctx.env.events.emit('notification:error', {
          level: 'error', message: 'Dropped sources could not be added to the Context.',
          details: error.message, event_source: 'context_builder_view.drop',
        });
      }
    };
    builder.addEventListener('dragenter', on_dragover);
    builder.addEventListener('dragover', on_dragover);
    builder.addEventListener('dragleave', on_dragleave);
    builder.addEventListener('drop', on_drop);
    owner_window?.addEventListener('dragend', clear_drag);
    owner_window?.addEventListener('blur', clear_drag);
    this.dispose_drop_target = () => {
      builder.removeEventListener('dragenter', on_dragover);
      builder.removeEventListener('dragover', on_dragover);
      builder.removeEventListener('dragleave', on_dragleave);
      builder.removeEventListener('drop', on_drop);
      owner_window?.removeEventListener('dragend', clear_drag);
      owner_window?.removeEventListener('blur', clear_drag);
      clear_drag();
    };
  }

  dispose_builder() {
    this.dispose_drop_target?.();
    this.dispose_drop_target = null;
    this.unsubscribe_deleted?.();
    this.unsubscribe_deleted = null;
    dispose_unmounted_builder(this.builder);
    this.builder = null;
  }

  async onClose() {
    this.closed = true;
    this.render_id += 1;
    this.dispose_builder();
    this.smart_context = null;
    this.rendered_context = null;
    this.container.replaceChildren();
    this.app.workspace.unregisterHoverLinkSource(this.constructor.view_type);
    await super.onClose();
  }
}
