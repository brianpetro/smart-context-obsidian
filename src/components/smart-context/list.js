import styles from './list.css';
import { setIcon } from 'obsidian';
import { partition_context_hierarchy, should_open_group } from './list_hierarchy.js';

const DASHBOARD_CLASS = 'sc-contexts-dashboard';
const DASHBOARD_LIST_CLASS = 'sc-contexts-dashboard-list';

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
    <div class="top-bar">
      <div class="sc-contexts-dashboard-heading">
        <div class="sc-contexts-dashboard-title">Smart Context</div>
        <div class="sc-contexts-dashboard-subtitle">Named contexts</div>
      </div>
      <button class="help" type="button" aria-label="Help"></button>
    </div>
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
  this.apply_style_sheet(styles);
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

  const help_btn = container.querySelector('button.help');
  setIcon(help_btn, 'help-circle');
  help_btn?.addEventListener('click', () => {
    window.open(
      'https://smartconnections.app/smart-context/builder/?utm_source=context-list-help#manage-named',
      '_external'
    );
  });

  const render_list_items = async () => {
    const items = smart_contexts.filter((ctx) => {
      // only named contexts
      if (ctx?.deleted) return false;
      return ctx?.data?.name && String(ctx.data.name).trim().length > 0;
    });

    this.empty(list_el);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.classList.add('sc-contexts-dashboard-empty');
      empty.textContent = 'No named contexts yet. Save a context to see it here.';
      list_el.appendChild(empty);
      return;
    }

    const { root_items, grouped_items } = partition_context_hierarchy(items);

    for (const item of root_items) {
      const row_el = await env.smart_components.render_component(
        'smart_context_list_item',
        item,
        params
      );
      if (row_el) list_el.appendChild(row_el);
    }

    const grouped_entries = Array.from(grouped_items.entries()).sort((left, right) => {
      const a = String(left?.[0] ?? '').toLocaleLowerCase();
      const b = String(right?.[0] ?? '').toLocaleLowerCase();
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });

    if (root_items.length && grouped_entries.length) {
      const separator = document.createElement('div');
      separator.className = 'sc-contexts-dashboard-separator';
      list_el.appendChild(separator);
    }

    for (const [group_name, grouped_contexts] of grouped_entries) {
      const group_details = document.createElement('details');
      group_details.className = 'sc-contexts-dashboard-group';
      group_details.open = should_open_group(grouped_contexts, params);

      const group_summary = document.createElement('summary');
      group_summary.className = 'sc-contexts-dashboard-group-summary';

      const group_icon = document.createElement('span');
      group_icon.className = 'sc-contexts-dashboard-group-icon';
      setIcon(group_icon, 'folder');

      const group_name_el = document.createElement('span');
      group_name_el.className = 'sc-contexts-dashboard-group-name';
      group_name_el.textContent = group_name;

      const group_badge = document.createElement('span');
      group_badge.className = 'sc-contexts-dashboard-group-badge';
      group_badge.textContent = String(grouped_contexts.length);
      group_badge.setAttribute('aria-label', `${grouped_contexts.length} contexts`);
      group_badge.title = `${grouped_contexts.length} contexts`;

      const group_chevron = document.createElement('span');
      group_chevron.className = 'sc-contexts-dashboard-group-chevron';
      setIcon(group_chevron, 'chevron-right');

      group_summary.appendChild(group_icon);
      group_summary.appendChild(group_name_el);
      group_summary.appendChild(group_badge);
      group_summary.appendChild(group_chevron);
      group_details.appendChild(group_summary);

      const group_items = document.createElement('div');
      group_items.className = 'sc-contexts-dashboard-group-items';
      group_details.appendChild(group_items);

      for (const grouped_item of grouped_contexts) {
        const row_el = await env.smart_components.render_component(
          'smart_context_list_item',
          grouped_item.ctx,
          {
            ...params,
            display_name: grouped_item.display_name,
          }
        );
        if (row_el) group_items.appendChild(row_el);
      }

      list_el.appendChild(group_details);
    }
  };

  await render_list_items();
  disposers.push(smart_contexts?.env?.events?.on('context:created', render_list_items));
  disposers.push(smart_contexts?.env?.events?.on('context:deleted', render_list_items));
  disposers.push(smart_contexts?.env?.events?.on('context:named', render_list_items));

  // cleanup
  this.attach_disposer(container, disposers);
  return container;
}
