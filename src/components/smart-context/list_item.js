import { Menu, Notice, setIcon } from 'obsidian';
import { write_smart_drag_data } from 'obsidian-smart-env';
import { resolve_dropped_context_item_keys } from '../../utils/resolve_dropped_context_item_keys.js';
import {
  get_context_description_input_value,
  persist_context_description,
} from '../../utils/actions_utils.js';

export const version = '3.1.6';

const DASHBOARD_ITEM_CLASS = 'sc-contexts-dashboard-item';
const delete_confirm_state_class = 'is-delete-confirm';

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [opts]
 * @returns {string}
 */
export function build_html(ctx, opts = {}) {
  return `<div>
    <div class="${DASHBOARD_ITEM_CLASS}" data-context-key="${ctx?.data?.key || ''}">
      <div class="sc-contexts-dashboard-item-header" tabindex="0" aria-label="${opts.display_name || ctx.name}">
        <button class="clickable-icon sc-contexts-dashboard-menu" type="button" aria-label="Actions for ${opts.display_name || ctx.name}"></button>
        <div class="sc-contexts-dashboard-item-copy">
          <span class="sc-contexts-dashboard-name">${opts.display_name || ctx.name}</span>
          <button class="sc-contexts-dashboard-description-preview" type="button" aria-expanded="false"></button>
        </div>
        <span class="sc-contexts-dashboard-count">${ctx.item_count} item${ctx.item_count === 1 ? '' : 's'}</span>
        <div class="sc-contexts-dashboard-delete-confirm" hidden>
          <span class="sc-contexts-dashboard-delete-label">Delete?</span>
          <button class="sc-contexts-dashboard-delete-cancel" type="button" aria-label="Cancel deletion">Cancel</button>
          <button class="sc-contexts-dashboard-delete-confirm-btn" type="button" aria-label="Confirm deletion">Delete</button>
        </div>
      </div>
      <div class="sc-contexts-dashboard-item-detail" hidden>
        <div class="sc-contexts-dashboard-description-editor-header">
          <span class="sc-contexts-dashboard-description-label">Description</span>
          <span class="sc-contexts-dashboard-description-help">Explain what this context contains and when to use it.</span>
        </div>
        <textarea class="sc-contexts-dashboard-description-input" rows="4" placeholder="What this context contains and when to use it" aria-label="Context description"></textarea>
        <div class="sc-contexts-dashboard-description-actions">
          <span class="sc-contexts-dashboard-description-shortcut">Ctrl/Cmd+Enter to save, Esc to cancel</span>
          <button class="sc-contexts-dashboard-description-cancel" type="button">Cancel</button>
          <button class="mod-cta sc-contexts-dashboard-description-save" type="button">Save</button>
        </div>
      </div>
    </div>
  </div>`;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [opts]
 * @returns {Promise<HTMLElement>}
 */
export async function render(ctx, opts = {}) {
  const html = build_html(ctx, opts);
  const frag = this.create_doc_fragment(html);
  const container = frag.querySelector(`.${DASHBOARD_ITEM_CLASS}`);
  post_process.call(this, ctx, container, opts);
  return container;
}

/**
 * @param {Menu} menu
 * @param {MouseEvent|KeyboardEvent} event
 * @param {HTMLElement} anchor_el
 * @returns {void}
 */
function show_menu(menu, event, anchor_el) {
  if (typeof MouseEvent !== 'undefined' && event instanceof MouseEvent) {
    menu.showAtMouseEvent(event);
    return;
  }

  const rect = anchor_el.getBoundingClientRect();
  if (typeof menu.showAtPosition === 'function') {
    menu.showAtPosition({ x: rect.left, y: rect.bottom });
    return;
  }

  menu.showAtMouseEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left,
    clientY: rect.bottom,
  }));
}

/**
 * Build the native note/editor fallback for a named context drag.
 * @param {string} context_name
 * @returns {string}
 */
function build_named_context_codeblock(context_name) {
  return `\`\`\`ctx\nctx:: ${context_name}\n\`\`\``;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [opts]
 * @returns {Promise<HTMLElement>}
 */
async function post_process(ctx, container, opts = {}) {
  const header_el = container.querySelector('.sc-contexts-dashboard-item-header');
  const menu_btn = container.querySelector('.sc-contexts-dashboard-menu');
  const count_span = container.querySelector('.sc-contexts-dashboard-count');
  const description_preview_btn = container.querySelector('.sc-contexts-dashboard-description-preview');
  const detail_el = container.querySelector('.sc-contexts-dashboard-item-detail');
  const description_input = container.querySelector('.sc-contexts-dashboard-description-input');
  const description_cancel_btn = container.querySelector('.sc-contexts-dashboard-description-cancel');
  const description_save_btn = container.querySelector('.sc-contexts-dashboard-description-save');
  const delete_confirm_el = container.querySelector('.sc-contexts-dashboard-delete-confirm');
  const delete_label_el = delete_confirm_el?.querySelector('.sc-contexts-dashboard-delete-label');
  const delete_cancel_btn = delete_confirm_el?.querySelector('.sc-contexts-dashboard-delete-cancel');
  const delete_confirm_btn = delete_confirm_el?.querySelector('.sc-contexts-dashboard-delete-confirm-btn');
  const disposers = [];

  let is_confirming_delete = false;
  let is_editing_description = false;
  let is_saving_description = false;
  let remove_confirm_dismiss_listeners = null;

  setIcon(menu_btn, 'menu');

  const resolve_context_name = () => {
    const raw = String(ctx?.data?.name ?? '').trim();
    if (raw) return raw;
    const fallback = String(opts?.display_name ?? '').trim();
    if (fallback) return fallback;
    return '';
  };

  const render_description = () => {
    const description = get_context_description_input_value(ctx);
    const has_description = description.length > 0;
    const context_name = resolve_context_name() || 'named context';

    container.classList.toggle('has-description', has_description);
    if (description_preview_btn) {
      description_preview_btn.textContent = has_description
        ? description
        : 'Add description';
      description_preview_btn.setAttribute(
        'aria-label',
        `${has_description ? 'Edit' : 'Add'} description for ${context_name}`,
      );
      if (has_description) {
        description_preview_btn.title = description;
      } else {
        description_preview_btn.removeAttribute('title');
      }
    }
    if (!is_editing_description && description_input) {
      description_input.value = description;
    }
  };

  const set_editing_description = (next_state, params = {}) => {
    const next = Boolean(next_state);
    if (next === is_editing_description) {
      if (next) description_input?.focus();
      return;
    }

    is_editing_description = next;
    container.classList.toggle('is-editing-description', next);
    if (detail_el) detail_el.hidden = !next;
    description_preview_btn?.setAttribute('aria-expanded', String(next));

    if (next) {
      if (description_input) {
        description_input.value = get_context_description_input_value(ctx);
        description_input.focus();
        description_input.setSelectionRange?.(0, 0);
        description_input.scrollTop = 0;
      }
      return;
    }

    if (description_input) {
      description_input.value = get_context_description_input_value(ctx);
    }
    if (params.focus_preview !== false) description_preview_btn?.focus();
  };

  const save_description = async () => {
    if (is_saving_description || !description_input) return;

    let should_refocus_input = false;
    is_saving_description = true;
    description_input.disabled = true;
    if (description_cancel_btn) description_cancel_btn.disabled = true;
    if (description_save_btn) description_save_btn.disabled = true;
    detail_el?.setAttribute('aria-busy', 'true');

    try {
      await persist_context_description(ctx, {
        input_value: description_input.value,
        event_source: 'smart_context_dashboard.description',
      });
      render_description();
      set_editing_description(false);
    } catch (error) {
      console.error('Smart Context: Failed to save description', error);
      new Notice(`Unable to save context description${error?.message ? `: ${error.message}` : '.'}`);
      should_refocus_input = true;
    } finally {
      is_saving_description = false;
      description_input.disabled = false;
      if (description_cancel_btn) description_cancel_btn.disabled = false;
      if (description_save_btn) description_save_btn.disabled = false;
      detail_el?.removeAttribute('aria-busy');
      if (should_refocus_input) description_input.focus();
    }
  };

  render_description();

  const delete_context = (params = {}) => {
    if (typeof ctx?.actions?.context_delete_context === 'function') {
      return ctx.actions.context_delete_context(params);
    }

    const context_name = resolve_context_name();
    ctx.delete();
    ctx.emit_event('context:deleted', {
      name: context_name,
      event_source: params.event_source || 'smart_context_dashboard.delete_confirm',
    });
    return true;
  };

  const set_confirming_delete = (next_state) => {
    const next = Boolean(next_state);
    if (next === is_confirming_delete) return;

    is_confirming_delete = next;

    if (is_confirming_delete) {
      set_editing_description(false, { focus_preview: false });
      const context_name = resolve_context_name();
      if (delete_label_el) {
        delete_label_el.textContent = context_name
          ? `Delete "${context_name}"?`
          : 'Delete this context?';
      }

      container.classList.add(delete_confirm_state_class);
      if (delete_confirm_el) delete_confirm_el.hidden = false;
      if (menu_btn) menu_btn.hidden = true;
      if (count_span) count_span.hidden = true;

      const dismiss_on_click_outside = (ev) => {
        if (!container.contains(ev.target)) set_confirming_delete(false);
      };
      const dismiss_on_escape = (ev) => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        set_confirming_delete(false);
      };

      document.addEventListener('pointerdown', dismiss_on_click_outside, true);
      document.addEventListener('keydown', dismiss_on_escape, true);

      remove_confirm_dismiss_listeners = () => {
        document.removeEventListener('pointerdown', dismiss_on_click_outside, true);
        document.removeEventListener('keydown', dismiss_on_escape, true);
      };

      if (delete_cancel_btn) {
        delete_cancel_btn.focus();
      } else if (delete_confirm_btn) {
        delete_confirm_btn.focus();
      }
      return;
    }

    container.classList.remove(delete_confirm_state_class);
    if (delete_confirm_el) delete_confirm_el.hidden = true;
    if (menu_btn) menu_btn.hidden = false;
    if (count_span) count_span.hidden = false;

    if (remove_confirm_dismiss_listeners) {
      remove_confirm_dismiss_listeners();
      remove_confirm_dismiss_listeners = null;
    }
  };

  const open_context_actions_menu = (ev) => {
    if (
      ev.type === 'contextmenu'
      && ev.target?.closest?.('textarea, input')
    ) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    set_confirming_delete(false);

    const app = ctx?.env?.smart_context_plugin?.app
      || ctx?.env?.plugin?.app
      || window.app
      || null
    ;
    if (!app) return;

    const menu = new Menu(app);
    const menu_params = {
      ...opts,
      app,
      confirm_delete: () => set_confirming_delete(true),
      include_copy_depth_submenu: false,
    };

    const before_copy_count = menu.items?.length || 0;
    ctx.env?.build_menu?.('smart_context:copy_menu', menu, ctx, menu_params);
    const after_copy_count = menu.items?.length || 0;
    if (after_copy_count > before_copy_count) menu.addSeparator();
    ctx.env?.build_menu?.('smart_context:action_menu', menu, ctx, menu_params);

    if (!(menu.items?.length > 0)) return;
    show_menu(menu, ev, menu_btn || header_el || container);
  };

  description_preview_btn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    set_confirming_delete(false);
    set_editing_description(true);
  });

  description_cancel_btn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    set_editing_description(false);
  });

  description_save_btn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    void save_description();
  });

  description_input?.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') {
      ev.preventDefault();
      set_editing_description(false);
      return;
    }
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      void save_description();
    }
  });

  count_span?.addEventListener('click', async () => {
    if (typeof ctx.collection?.open_builder === 'function') {
      ctx.collection.open_builder(ctx, {
        event_source: 'smart_context_dashboard.item_count',
      });
      return;
    }
    ctx.emit_event('context_selector:open');
  });

  menu_btn?.addEventListener('click', open_context_actions_menu);
  menu_btn?.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    open_context_actions_menu(ev);
  });

  delete_cancel_btn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    set_confirming_delete(false);
  });

  delete_confirm_btn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    set_confirming_delete(false);
    delete_context({
      confirmed: true,
      event_source: 'smart_context_dashboard.delete_confirm',
    });
  });

  header_el?.addEventListener('click', (ev) => {
    if (!is_confirming_delete) return;
    if (delete_confirm_el?.contains(ev.target)) return;
    set_confirming_delete(false);
  });

  /* right-click actions menu */
  container.addEventListener('contextmenu', open_context_actions_menu);

  const on_dragstart = (event) => {
    if (
      is_confirming_delete
      || is_editing_description
      || event.target?.closest?.('button')
    ) {
      event.preventDefault();
      return;
    }

    const context_name = resolve_context_name();
    const data_transfer = event.dataTransfer;
    if (!context_name || typeof data_transfer?.setData !== 'function') {
      event.preventDefault();
      return;
    }

    write_smart_drag_data(data_transfer, ctx);
    data_transfer.setData('text/plain', build_named_context_codeblock(context_name));
    data_transfer.effectAllowed = 'copy';
  };

  header_el?.setAttribute('draggable', 'true');
  header_el?.addEventListener('dragstart', on_dragstart);
  disposers.push(() => {
    header_el?.removeEventListener('dragstart', on_dragstart);
    header_el?.removeAttribute('draggable');
  });

  const set_drag_over = (active) => {
    container.classList.toggle('is-drag-over', Boolean(active));
  };
  const is_description_editor_event = (event) => {
    return Boolean(event.target?.closest?.('.sc-contexts-dashboard-item-detail'));
  };
  const on_dragenter = (event) => {
    if (is_confirming_delete || is_description_editor_event(event)) {
      set_drag_over(false);
      return;
    }
    event.preventDefault();
    set_drag_over(true);
  };
  const on_dragover = (event) => {
    if (is_confirming_delete || is_description_editor_event(event)) {
      set_drag_over(false);
      return;
    }
    event.preventDefault();
    set_drag_over(true);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  };
  const on_dragleave = (event) => {
    if (event.relatedTarget && container.contains(event.relatedTarget)) return;
    set_drag_over(false);
  };
  const on_drop = async (event) => {
    if (is_description_editor_event(event)) {
      set_drag_over(false);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    set_drag_over(false);
    if (is_confirming_delete) return;

    const item_keys = resolve_dropped_context_item_keys(ctx.env, event.dataTransfer);
    if (!item_keys.length) {
      new Notice('Drop notes, folders, Connections, or Lookup results onto a named context.');
      return;
    }

    const action = ctx.actions?.context_add_items;
    if (typeof action !== 'function') return;
    await action({ items: item_keys });

    const context_name = resolve_context_name() || 'Named context';
    const item_label = item_keys.length === 1 ? 'item' : 'items';
    new Notice(`Updated "${context_name}" with ${item_keys.length} ${item_label}.`);
  };

  container.addEventListener('dragenter', on_dragenter);
  container.addEventListener('dragover', on_dragover);
  container.addEventListener('dragleave', on_dragleave);
  container.addEventListener('drop', on_drop);

  disposers.push(() => {
    container.removeEventListener('dragenter', on_dragenter);
    container.removeEventListener('dragover', on_dragover);
    container.removeEventListener('dragleave', on_dragleave);
    container.removeEventListener('drop', on_drop);
    set_drag_over(false);
  });

  const update_count = () => {
    const count_span = container.querySelector('.sc-contexts-dashboard-count');
    if (count_span) {
      count_span.textContent = `${ctx.item_count} item${ctx.item_count === 1 ? '' : 's'}`;
    }
  };
  const update_context_details = () => {
    update_count();
    render_description();
  };
  const rename_handler = (payload) => {
    const name_span = container.querySelector('.sc-contexts-dashboard-name');
    if (name_span && payload?.name) {
      name_span.textContent = payload.name;
    } else {
      console.warn('Received context:renamed event without name payload or missing name_span element', { payload, name_span });
    }
    render_description();
  };
  disposers.push(ctx.on_event('context:renamed', rename_handler));
  disposers.push(ctx.on_event('context:updated', update_context_details));

  // cleanup any active delete confirmation listeners
  disposers.push(() => set_confirming_delete(false));
  disposers.push(() => set_editing_description(false, { focus_preview: false }));

  this.attach_disposer(container, disposers);

  return container;
}
