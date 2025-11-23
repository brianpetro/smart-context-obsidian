import { Menu } from 'obsidian';

const DASHBOARD_ITEM_CLASS = 'sc-contexts-dashboard-item';

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [opts]
 * @returns {string}
 */
export function build_html(ctx, opts = {}) {
  return `<div>
    <div class="${DASHBOARD_ITEM_CLASS}" data-context-key="${ctx?.data?.key || ''}">
      <div class="sc-contexts-dashboard-item-header" tabindex="0" aria-label="${ctx.name}">
        <button class="sc-contexts-dashboard-show" aria-expanded="false" aria-label="Show ${ctx.name}">Show</button>
        <span class="sc-contexts-dashboard-name">${ctx.name}</span>
        <span class="sc-contexts-dashboard-count">${ctx.item_count} items</span>
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
  const show_btn = container.querySelector('.sc-contexts-dashboard-show');
  show_btn.addEventListener('click', async () => {
    ctx.emit_event('context_selector:open');
  });

  /* right‑click actions menu */
  container.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
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
  this.attach_disposer(container, disposers);

  return container;
}
