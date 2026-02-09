import { Menu } from 'obsidian';

const DASHBOARD_ITEM_CLASS = 'sc-contexts-dashboard-item';
const delete_context_label = 'Delete named context';
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
        <button class="sc-contexts-dashboard-show" aria-expanded="false" aria-label="Show ${opts.display_name || ctx.name}">Show</button>
        <span class="sc-contexts-dashboard-name">${opts.display_name || ctx.name}</span>
        <span class="sc-contexts-dashboard-count">${ctx.item_count} items</span>
        <div class="sc-contexts-dashboard-delete-confirm" hidden>
          <span class="sc-contexts-dashboard-delete-label">Delete?</span>
          <button class="sc-contexts-dashboard-delete-cancel" type="button" aria-label="Cancel deletion">Cancel</button>
          <button class="sc-contexts-dashboard-delete-confirm-btn" type="button" aria-label="Confirm deletion">Delete</button>
        </div>
      </div>
      <div class="sc-contexts-dashboard-item-detail" hidden></div>
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
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [opts]
 * @returns {Promise<HTMLElement>}
 */
async function post_process(ctx, container, opts = {}) {
  const header_el = container.querySelector('.sc-contexts-dashboard-item-header');
  const show_btn = container.querySelector('.sc-contexts-dashboard-show');
  const count_span = container.querySelector('.sc-contexts-dashboard-count');
  const delete_confirm_el = container.querySelector('.sc-contexts-dashboard-delete-confirm');
  const delete_label_el = delete_confirm_el?.querySelector('.sc-contexts-dashboard-delete-label');
  const delete_cancel_btn = delete_confirm_el?.querySelector('.sc-contexts-dashboard-delete-cancel');
  const delete_confirm_btn = delete_confirm_el?.querySelector('.sc-contexts-dashboard-delete-confirm-btn');

  let is_confirming_delete = false;
  let remove_confirm_dismiss_listeners = null;

  const resolve_context_name = () => {
    const raw = String(ctx?.data?.name ?? '').trim();
    if (raw) return raw;
    const fallback = String(opts?.display_name ?? '').trim();
    if (fallback) return fallback;
    return '';
  };

  const set_confirming_delete = (next_state) => {
    const next = Boolean(next_state);
    if (next === is_confirming_delete) return;

    is_confirming_delete = next;

    if (is_confirming_delete) {
      const context_name = resolve_context_name();
      if (delete_label_el) {
        delete_label_el.textContent = context_name
          ? `Delete "${context_name}"?`
          : 'Delete this context?';
      }

      container.classList.add(delete_confirm_state_class);
      if (delete_confirm_el) delete_confirm_el.hidden = false;
      if (show_btn) show_btn.hidden = true;
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
    if (show_btn) show_btn.hidden = false;
    if (count_span) count_span.hidden = false;

    if (remove_confirm_dismiss_listeners) {
      remove_confirm_dismiss_listeners();
      remove_confirm_dismiss_listeners = null;
    }
  };

  show_btn.addEventListener('click', async () => {
    ctx.emit_event('context_selector:open');
  });

  delete_cancel_btn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    set_confirming_delete(false);
  });

  delete_confirm_btn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const context_name = resolve_context_name();
    set_confirming_delete(false);
    ctx.delete();
    ctx.emit_event('context:deleted', { name: context_name });
  });

  header_el?.addEventListener('click', (ev) => {
    if (!is_confirming_delete) return;
    if (delete_confirm_el?.contains(ev.target)) return;
    set_confirming_delete(false);
  });

  /* right-click actions menu */
  container.addEventListener('contextmenu', (ev) => {
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
    menu.addItem(mi =>
      mi.setTitle('Copy context to clipboard')
        .setIcon('copy')
        .onClick(async (ev, ...other) => {
          ctx.actions.context_copy_to_clipboard();
        })
    );
    if (can_delete_context(ctx)) {
      menu.addItem(mi =>
        mi.setTitle(delete_context_label)
          .setIcon('trash')
          .onClick(() => {
            set_confirming_delete(true);
          })
      );
    }

    menu.showAtMouseEvent(ev);
  });

  const disposers = [];
  const update_count = () => {
    const count_span = container.querySelector('.sc-contexts-dashboard-count');
    if (count_span) {
      count_span.textContent = `${ctx.item_count} item${ctx.item_count === 1 ? '' : 's'}`;
    }
  };
  const rename_handler = (payload) => {
    const name_span = container.querySelector('.sc-contexts-dashboard-name');
    if (name_span && payload?.name) {
      name_span.textContent = payload.name;
    } else {
      console.warn('Received context:renamed event without name payload or missing name_span element', { payload, name_span });
    }
  };
  disposers.push(ctx.on_event('context:renamed', rename_handler));
  disposers.push(ctx.on_event('context:updated', update_count));

  // cleanup any active delete confirmation listeners
  disposers.push(() => set_confirming_delete(false));

  this.attach_disposer(container, disposers);

  return container;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {boolean}
 */
function can_delete_context(ctx) {
  const context_name = String(ctx?.data?.name ?? '').trim();
  return context_name.length > 0;
}
