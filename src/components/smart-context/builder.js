import { Menu, setIcon } from 'obsidian';
import { build_context_actions_menu } from 'obsidian-smart-env/src/utils/smart-context/copy_actions.js';
import { render_name_input } from '../../utils/named_context_utils.js';
import styles from './builder.css';

export const version = '3.1.6';

let builder_instance_id = 0;

export function build_html() {
  return `
    <div class="sc-context-builder">
      <div class="sc-context-builder-header">
        <div class="sc-context-builder-header-copy">
          <div class="sc-context-builder-origin-row">
            <span class="sc-context-builder-origin"></span>
            <button class="sc-context-builder-origin-undo" type="button" hidden>Undo</button>
          </div>
          <div class="sc-context-builder-name"></div>
          <div class="sc-context-builder-summary"></div>
        </div>
        <div class="sc-context-builder-primary"></div>
      </div>

      <div class="sc-context-builder-review">
        <div class="sc-context-builder-empty" hidden>
          <div class="sc-context-builder-empty-title">Start with useful evidence</div>
          <div class="sc-context-builder-empty-description">
            Add the note or sources this assignment depends on. You can review the package before copying it.
          </div>
        </div>
        <div class="sc-context-builder-tree"></div>
        <div class="sc-context-builder-exclusions" hidden></div>
      </div>

      <div class="sc-context-builder-source-nav">
        <div class="sc-context-builder-source-modes" role="tablist" aria-label="Context source types"></div>
        <div class="sc-context-builder-source-description"></div>
      </div>
    </div>
  `.trim();
}

/**
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {any} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function render(ctx, params = {}) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html());
  const container = frag.firstElementChild;
  let disposed = false;
  let initialize_timeout = null;

  const is_disposed = () => {
    if (container.dataset.contextBuilderDisposed === 'true') return true;
    if (disposed) return true;
    if (params.modal?._is_closed === true) return true;
    return Boolean(
      params.modal?._builder_container
      && params.modal._builder_container !== container
    );
  };
  const initialize = async () => {
    initialize_timeout = null;
    if (is_disposed()) return;

    try {
      await post_process.call(this, ctx, container, {
        ...params,
        is_disposed,
      });
    } catch (error) {
      if (is_disposed()) return;
      if (typeof params.modal?.show_render_error === 'function') {
        params.modal.show_render_error(error);
        return;
      }
      console.error('Context Builder: Failed to initialize Builder', error);
    }
  };

  initialize_timeout = activeWindow.setTimeout(() => {
    void initialize();
  }, 0);
  this.attach_disposer(container, () => {
    disposed = true;
    if (initialize_timeout) activeWindow.clearTimeout(initialize_timeout);
    initialize_timeout = null;
  });

  return container;
}

/**
 * Mount a discarded Builder element for one task so Smart View can observe
 * its removal and run the element's registered disposers.
 *
 * @param {HTMLElement|any} builder
 * @returns {void}
 */
export function dispose_unmounted_builder(builder) {
  if (!builder) return;
  if (builder.dataset) builder.dataset.contextBuilderDisposed = 'true';
  if (builder.isConnected) {
    builder.remove?.();
    return;
  }

  const body = builder.ownerDocument?.body;
  if (!body?.appendChild) {
    builder.remove?.();
    return;
  }

  builder.hidden = true;
  builder.setAttribute?.('aria-hidden', 'true');
  body.appendChild(builder);
  activeWindow.setTimeout(() => builder.remove?.(), 0);
}

/**
 * Compose the Context Builder around existing Smart Context actions and the
 * Builder review tree.
 *
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {any} params
 * @returns {Promise<HTMLElement>}
 */
export async function post_process(ctx, container, params = {}) {
  const modal = params.modal;
  if (!modal) throw new Error('Context Builder requires a modal.');
  const is_disposed = typeof params.is_disposed === 'function'
    ? params.is_disposed
    : () => false
  ;

  const origin_el = container.querySelector('.sc-context-builder-origin');
  const undo_btn = container.querySelector('.sc-context-builder-origin-undo');
  const name_container = container.querySelector('.sc-context-builder-name');
  const summary_container = /** @type {HTMLElement} */ (
    container.querySelector('.sc-context-builder-summary')
  );
  const primary_container = container.querySelector('.sc-context-builder-primary');
  const review_container = /** @type {HTMLElement} */ (
    container.querySelector('.sc-context-builder-review')
  );
  const tree_container = /** @type {HTMLElement} */ (
    container.querySelector('.sc-context-builder-tree')
  );
  const exclusions_container = /** @type {HTMLElement} */ (
    container.querySelector('.sc-context-builder-exclusions')
  );
  const empty_container = /** @type {HTMLElement} */ (
    container.querySelector('.sc-context-builder-empty')
  );
  const source_modes_container = container.querySelector('.sc-context-builder-source-modes');
  const source_description = container.querySelector('.sc-context-builder-source-description');
  let source_count = Number(ctx.item_count || 0);
  let resolved_context_items = null;
  let refresh_summary = null;
  let refresh_primary = null;
  let reveal_missing_items = null;
  let focus_exclusions = null;
  let missing_flash_timeout = null;
  let review_mode = 'included';
  let included_review_scroll_top = 0;
  let exclusion_count = Number(ctx.excluded_item_count || 0);
  let has_exclusions_component = false;

  builder_instance_id += 1;
  exclusions_container.id = `sc-context-builder-exclusions-${builder_instance_id}`;

  const update_review_state = () => {
    const has_context_items = source_count > 0;
    const show_exclusions = review_mode === 'excluded' && has_exclusions_component;

    review_container.dataset.reviewMode = show_exclusions
      ? 'excluded'
      : 'included'
    ;
    exclusions_container.hidden = !show_exclusions;
    empty_container.hidden = show_exclusions || has_context_items;
    tree_container.hidden = show_exclusions || !has_context_items;
  };

  render_name_input(ctx, name_container);

  const render_origin = () => {
    origin_el.textContent = get_context_origin_label(modal.origin);
    undo_btn.hidden = !modal.has_undoable_origin_seed;
  };

  const focus_first_missing_item = () => {
    reveal_missing_items?.();
    const missing_el = tree_container.querySelector(
      '.sc-context-builder-tree-name.is-missing, .sc-context-builder-tree-warning',
    );
    if (!missing_el) return;
    missing_el.scrollIntoView({ block: 'nearest' });
    missing_el.classList.add('is-flash');
    if (missing_flash_timeout) activeWindow.clearTimeout(missing_flash_timeout);
    missing_flash_timeout = activeWindow.setTimeout(() => {
      missing_el.classList.remove('is-flash');
      missing_flash_timeout = null;
    }, 700);
  };

  const open_exclusions = () => {
    if (!has_exclusions_component) return;
    included_review_scroll_top = review_container.scrollTop;
    review_mode = 'excluded';
    update_review_state();
    refresh_summary?.();
    review_container.scrollTop = 0;
    activeWindow.setTimeout(() => {
      if (!is_disposed() && review_mode === 'excluded') focus_exclusions?.();
    }, 0);
  };

  const close_exclusions = () => {
    review_mode = 'included';
    update_review_state();
    refresh_summary?.();
    activeWindow.setTimeout(() => {
      if (is_disposed() || review_mode !== 'included') return;
      review_container.scrollTop = included_review_scroll_top;
      const trigger = /** @type {HTMLButtonElement|null} */ (
        summary_container.querySelector(
          '.sc-context-builder-exclusions-trigger',
        )
      );
      if (trigger) trigger.focus();
      else tree_container.querySelector('button')?.focus?.();
    }, 0);
  };

  const focus_first_truncated_selection = () => {
    const truncated_el = tree_container.querySelector(
      '.sc-context-builder-tree-truncated',
    );
    if (!truncated_el) return;
    truncated_el.scrollIntoView({ block: 'nearest' });
    truncated_el.classList.add('is-flash');
    if (missing_flash_timeout) activeWindow.clearTimeout(missing_flash_timeout);
    missing_flash_timeout = activeWindow.setTimeout(() => {
      truncated_el.classList.remove('is-flash');
      missing_flash_timeout = null;
    }, 700);
  };

  const tree = await ctx.env.smart_components.render_component(
    'smart_context_builder_tree',
    ctx,
    {
      ...params,
      on_resolved_items(items) {
        resolved_context_items = items;
        refresh_summary?.();
      },
      on_ready(callback) {
        reveal_missing_items = callback;
      },
    },
  );
  if (is_disposed()) {
    dispose_unmounted_builder(tree);
    return container;
  }
  if (tree) tree_container.appendChild(tree);

  const rules = ctx.env.config.components.smart_context_rules_list
    ? await ctx.env.smart_components.render_component(
      'smart_context_rules_list',
      ctx,
      {
        ...params,
        review_mode: true,
        on_close: close_exclusions,
        on_exclusion_count_change(next_exclusion_count = 0) {
          exclusion_count = next_exclusion_count;
          refresh_summary?.();
        },
        on_ready(callback) {
          focus_exclusions = callback;
        },
      },
    )
    : null
  ;
  if (is_disposed()) {
    dispose_unmounted_builder(rules);
    return container;
  }
  if (rules) {
    has_exclusions_component = true;
    exclusions_container.appendChild(rules);
    update_review_state();
  }

  const summary = await ctx.env.smart_components.render_component(
    'smart_context_builder_summary',
    ctx,
    {
      ...params,
      on_exclusions_click: has_exclusions_component ? open_exclusions : null,
      on_truncated_click: focus_first_truncated_selection,
      on_missing_click: focus_first_missing_item,
      get_exclusion_count: () => exclusion_count,
      get_exclusions_controls_id: () => exclusions_container.id,
      is_exclusions_open: () => review_mode === 'excluded',
      get_context_items: () => resolved_context_items,
      on_ready(callback) {
        refresh_summary = callback;
      },
      on_summary(next_summary) {
        source_count = next_summary.source_count_known === false
          ? Number(ctx.item_count || 0)
          : next_summary.source_count
        ;
        update_review_state();
        refresh_primary?.();
      },
    },
  );
  if (is_disposed()) {
    dispose_unmounted_builder(summary);
    return container;
  }
  if (summary) summary_container.appendChild(summary);

  const primary_control = await ctx.env.smart_components.render_component(
    'smart_context_builder_primary_control',
    ctx,
    {
      ...params,
      event_source: 'context_builder.primary',
      get_source_count: () => source_count,
      get_menu_params: () => ({
        ...params,
        modal,
        origin: modal.origin,
        include_copy_depth_submenu: false,
      }),
      on_add_sources: () => modal.focus_search(),
      on_ready(callback) {
        refresh_primary = callback;
      },
      overflow_groups: [
        {
          menu_key: 'smart_context:action_menu',
          scope: ctx,
        },
        {
          menu_key: 'smart_contexts:menu',
          scope: ctx.collection,
        },
      ],
    },
  );
  if (is_disposed()) {
    dispose_unmounted_builder(primary_control);
    return container;
  }
  if (primary_control) primary_container.appendChild(primary_control);

  const render_source_modes = () => {
    source_modes_container.replaceChildren();
    modal.source_modes.forEach((source_mode) => {
      const is_active = source_mode.action_key === modal.active_source_mode;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sc-context-builder-source-mode';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(is_active));
      button.tabIndex = is_active ? 0 : -1;
      if (is_active) button.classList.add('is-active');

      const icon_el = document.createElement('span');
      icon_el.className = 'sc-context-builder-source-mode-icon';
      setIcon(icon_el, source_mode.icon);
      button.appendChild(icon_el);
      button.append(source_mode.label);
      button.addEventListener('click', () => {
        modal.set_active_source_mode(source_mode.action_key);
      });
      source_modes_container.appendChild(button);
    });

    source_description.textContent = modal.active_source_mode_meta?.description || '';
    source_description.hidden = !source_description.textContent;
  };

  const refresh_builder_chrome = () => {
    render_origin();
    render_source_modes();
    update_review_state();
  };
  const refresh_context_state = () => {
    render_origin();
    update_review_state();
  };
  refresh_builder_chrome();
  modal.set_builder_chrome_refresh(refresh_builder_chrome);

  const on_undo_click = () => modal.undo_origin_seed();
  undo_btn.addEventListener('click', on_undo_click);

  const on_context_menu = (event) => {
    const interactive_target = event.target?.closest?.(
      'input, textarea, button, select, [contenteditable="true"]',
    );
    if (interactive_target) return;

    const app = ctx?.env?.obsidian_app
      || ctx?.env?.plugin?.app
      || activeWindow?.app
    ;
    if (!app) return;

    const menu = new Menu(app);
    try {
      build_context_actions_menu(ctx, menu, {
        ...params,
        modal,
        origin: modal.origin,
        include_copy_depth_submenu: false,
      });
    } catch (error) {
      console.error('Smart Context Builder: Failed to build context actions menu', error);
      ctx.env.events.emit('notification:error', {
        level: 'error',
        message: 'Context actions could not be opened.',
        event_source: 'context_builder.context_menu',
      });
      return;
    }
    if (!menu.items?.length) return;

    event.preventDefault();
    event.stopPropagation();
    menu.showAtMouseEvent(event);
  };
  container.addEventListener('contextmenu', on_context_menu);

  if (is_disposed()) {
    container.removeEventListener('contextmenu', on_context_menu);
    undo_btn.removeEventListener('click', on_undo_click);
    modal.clear_builder_chrome_refresh(refresh_builder_chrome);
    return container;
  }

  this.attach_disposer(container, [
    ctx.on_event('context:updated', refresh_context_state),
    () => undo_btn.removeEventListener('click', on_undo_click),
    () => container.removeEventListener('contextmenu', on_context_menu),
    () => modal.clear_builder_chrome_refresh(refresh_builder_chrome),
    () => {
      if (missing_flash_timeout) activeWindow.clearTimeout(missing_flash_timeout);
      missing_flash_timeout = null;
      refresh_summary = null;
      refresh_primary = null;
      reveal_missing_items = null;
      focus_exclusions = null;
    },
  ]);
  return container;
}

/**
 * @param {object} origin
 * @returns {string}
 */
function get_context_origin_label(origin = {}) {
  const source_path = String(origin.source_path || '').trim();

  if (['active_note', 'codeblock'].includes(origin.kind) && source_path) {
    return `Context for ${get_basename(source_path)}`;
  }
  if (origin.kind === 'folder' && source_path) {
    return `Started from ${source_path}`;
  }
  if (origin.kind === 'file_selection') {
    const selection_count = Number(origin.selection_count) || 0;
    if (selection_count === 1) return 'Started from 1 selected item';
    if (selection_count > 1) return `Started from ${selection_count} selected items`;
  }
  if (origin.kind === 'preselected') return 'Review context';
  return 'Build context';
}

/**
 * @param {string} path
 * @returns {string}
 */
function get_basename(path = '') {
  return String(path).replace(/\\+/g, '/').split('/').pop() || path;
}
