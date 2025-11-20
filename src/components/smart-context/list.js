const DASHBOARD_CLASS       = 'sc-contexts-dashboard';
const DASHBOARD_LIST_CLASS  = 'sc-contexts-dashboard-list';

/**
 * Normalize filter input.
 * @param {object} raw_filters
 * @returns {{query: string}}
 */
export function normalize_filters(raw_filters = {}) {
  const query = (raw_filters.query ?? '').toString().trim();
  return { query };
}

/**
 * Resolve sortable timestamp from metadata.
 * @param {Record<string, unknown>|undefined} meta
 * @returns {number}
 */
export function resolve_timestamp(meta) {
  if (!meta) return 0;
  const candidates = [
    meta.updated_at,
    meta.updated,
    meta.modified_at,
    meta.saved_at,
    meta.created_at,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string' && candidate) {
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return 0;
}

/**
 * Build base dashboard HTML shell.
 * @returns {string}
 */
export function build_html() {
  return `<div class="${DASHBOARD_CLASS}">
    <div class="${DASHBOARD_LIST_CLASS}"></div>
  </div>`;
}

/**
 * Render dashboard component.
 * @param {import('smart-contexts').SmartContexts} smart_contexts
 * @param {object} params
 * @returns {Promise<HTMLElement>}
 */
export async function render(smart_contexts, params = {}) {
  const html = build_html();
  const fragment = this.create_doc_fragment(html);
  const container = fragment.querySelector(`.${DASHBOARD_CLASS}`);
  post_process.call(this, smart_contexts, container, params);
  return container;
}

/**
 * Post-process DOM with live data and events.
 * Renders each context via <smart_context_list_item>.
 *
 * @param {import('smart-contexts').SmartContexts} smart_contexts
 * @param {HTMLElement} container
 * @param {object} params
 * @returns {Promise<HTMLElement>}
 */
export async function post_process(smart_contexts, container, params = {}) {
  const disposers = [];
  const list_el = container.querySelector(`.${DASHBOARD_LIST_CLASS}`);
  const env = smart_contexts?.env;

  const render_list_items = async () => {
    const items = smart_contexts.filter();
    this.empty(list_el);
    if (!items.length) {
      const empty = document.createElement('div');
      empty.classList.add('sc-contexts-dashboard-empty');
      empty.textContent = 'No named contexts yet. Save a context to see it here.';
      list_el.appendChild(empty);
      return;
    }
    for (const item of items) {
      // ── KEY CHANGE: render each list item via the extracted component ──
      const row_el = await env.smart_components.render_component(
        'smart_context_list_item',
        item,
        params
      );
      if (row_el) list_el.appendChild(row_el);
    }
  };


  await render_list_items();
  const rerender = () => { render_list_items(); };
  disposers.push(smart_contexts?.env?.events?.on('context:created', rerender));

  // cleanup
  this.attach_disposer(container, disposers.filter(Boolean));
  return container;
}
