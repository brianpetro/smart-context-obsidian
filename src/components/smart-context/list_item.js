import { Menu } from 'obsidian';

const DASHBOARD_ITEM_CLASS = 'sc-contexts-dashboard-item';
const DASHBOARD_EXPANDED_CLASS = 'is-expanded';

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [opts]
 * @returns {string}
 */
export function build_html(ctx, opts = {}) {
  const name =
    (ctx?.data?.name && String(ctx.data.name).trim()) ||
    (ctx?.data?.key && String(ctx.data.key).trim()) ||
    'Untitled context';
  const item_count = Array.isArray(ctx?.context_item_keys)
    ? ctx.context_item_keys.length
    : Object.keys(ctx?.data?.context_items || {}).length;

  return `<div>
    <div class="${DASHBOARD_ITEM_CLASS}" data-context-key="${ctx?.data?.key || ''}">
      <div class="sc-contexts-dashboard-item-header" tabindex="0" aria-label="${name}">
        <button class="sc-contexts-dashboard-expand" aria-expanded="false" aria-label="Show ${name}">Show</button>
        <span class="sc-contexts-dashboard-name">${name}</span>
        <span class="sc-contexts-dashboard-count">${item_count} items</span>
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
export async function post_process(ctx, container, opts = {}) {
  const header_el = container.querySelector('.sc-contexts-dashboard-item-header');
  const name_el   = container.querySelector('.sc-contexts-dashboard-name');
  const count_el  = container.querySelector('.sc-contexts-dashboard-count');
  const toggle_btn = container.querySelector('.sc-contexts-dashboard-expand');
  const detail_el  = container.querySelector('.sc-contexts-dashboard-item-detail');

  const get_name = () =>
    (ctx?.data?.name && String(ctx.data.name).trim()) ||
    (ctx?.data?.key && String(ctx.data.key).trim()) ||
    'Untitled context';

  const get_count = () =>
    (Array.isArray(ctx?.context_item_keys)
      ? ctx.context_item_keys.length
      : Object.keys(ctx?.data?.context_items || {}).length);

  const refresh_header = () => {
    name_el.textContent = get_name();
    count_el.textContent = `${get_count()} items`;
  };

  const render_expanded = async () => {
    detail_el.hidden = false;
    detail_el.textContent = 'Loading…';
    const comp = await ctx.env.render_component('smart_context_item', ctx, { from: 'dashboard' });
    this.empty(detail_el);
    if (comp) {
      detail_el.appendChild(comp);
    } else {
      detail_el.textContent = 'Unable to load context view.';
    }
  };

  const collapse = () => {
    container.classList.remove(DASHBOARD_EXPANDED_CLASS);
    toggle_btn.setAttribute('aria-expanded', 'false');
    detail_el.hidden = true;
    this.empty(detail_el);
  };

  const expand = async () => {
    container.classList.add(DASHBOARD_EXPANDED_CLASS);
    toggle_btn.setAttribute('aria-expanded', 'true');
    await render_expanded();
  };

  /* expand/collapse */
  toggle_btn.addEventListener('click', async () => {
    if (container.classList.contains(DASHBOARD_EXPANDED_CLASS)) {
      collapse();
    } else {
      await expand();
    }
  });

  /* right‑click actions menu */
  header_el.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const app = ctx?.env?.smart_context_plugin?.app || ctx?.env?.plugin?.app || null;
    if (!app) return;

    const menu = new Menu(app);

    menu.addItem(mi =>
      mi.setTitle(
        container.classList.contains(DASHBOARD_EXPANDED_CLASS) ? 'Collapse' : 'Expand'
      ).setIcon('expand')
       .onClick(async () => {
         if (container.classList.contains(DASHBOARD_EXPANDED_CLASS)) {
           collapse();
         } else {
           await expand();
         }
       })
    );

    if (ctx.has_context_items) {
      menu.addItem(mi =>
        mi.setTitle('Copy context')
          .setIcon('copy')
          .onClick(async () => {
            // TODO: handle copy context to clipboard
          })
      );
    }

    menu.showAtMouseEvent(ev);
  });

  refresh_header();
  
  /* react to context updates */
  const disposers = [];
  const on_updated = async (event) => {
    refresh_header();
    if (container.classList.contains(DASHBOARD_EXPANDED_CLASS)) {
      await render_expanded();
    }
  };
  disposers.push(ctx.on_event('context:updated', on_updated));
  this.attach_disposer(container, disposers.filter(Boolean));
  return container;
}
