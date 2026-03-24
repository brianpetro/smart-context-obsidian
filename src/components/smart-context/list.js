import styles from './list.css';
import { setIcon } from 'obsidian';
import { is_codeblock_context_key } from '../../utils/pure_utils.js';

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
 * Uses a latest-render-wins flow:
 * - each new render aborts the previous in-flight render
 * - rows are built off-DOM in a DocumentFragment
 * - the list is replaced atomically after a full successful render
 * - bursty lifecycle events are coalesced into a single queued render
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

  let active_render_controller = null;
  let render_queued = false;

  /**
   * Create an abort error compatible with normal cancellation handling.
   * @returns {Error}
   */
  const create_abort_error = () => {
    const error = new Error('Render aborted.');
    error.name = 'AbortError';
    return error;
  };

  /**
   * Throw when the current render has been aborted.
   * @param {AbortSignal|undefined|null} signal
   * @returns {void}
   */
  const throw_if_aborted = (signal) => {
    if (signal?.aborted) throw create_abort_error();
  };

  /**
   * Resolve current named contexts for display.
   * @returns {Array<import('smart-contexts').SmartContext>}
   */
  const get_named_contexts = () => {
    return smart_contexts.filter((ctx) => {
      // only named contexts
      if (ctx?.deleted) return false;
      if (is_codeblock_context_key(ctx?.key)) return false;
      return ctx?.data?.name && String(ctx.data.name).trim().length > 0;
    });
  };

  /**
   * Build list contents off-DOM so UI updates commit atomically.
   * @param {AbortSignal} signal
   * @returns {Promise<DocumentFragment>}
   */
  const build_list_fragment = async (signal) => {
    const fragment = document.createDocumentFragment();
    const items = get_named_contexts();

    if (!items.length) {
      const empty = document.createElement('div');
      empty.classList.add('sc-contexts-dashboard-empty');
      empty.textContent = 'No named contexts yet. Save a context to see it here.';
      fragment.appendChild(empty);
      return fragment;
    }

    const { root_items, grouped_items } = partition_context_hierarchy(items);

    for (const item of root_items) {
      const row_el = await env.smart_components.render_component(
        'smart_context_list_item',
        item,
        params
      );
      throw_if_aborted(signal);
      if (row_el) fragment.appendChild(row_el);
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
      fragment.appendChild(separator);
    }

    for (const [group_name, grouped_contexts] of grouped_entries) {
      throw_if_aborted(signal);

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
        throw_if_aborted(signal);
        if (row_el) group_items.appendChild(row_el);
      }

      fragment.appendChild(group_details);
    }

    return fragment;
  };

  /**
   * Render list contents with latest-render-wins semantics.
   * @returns {Promise<void>}
   */
  const render_list_items = async () => {
    active_render_controller?.abort();

    const render_controller = new AbortController();
    active_render_controller = render_controller;

    try {
      const fragment = await build_list_fragment(render_controller.signal);
      throw_if_aborted(render_controller.signal);
      list_el.replaceChildren(fragment);
    } catch (error) {
      if (error?.name !== 'AbortError') throw error;
    } finally {
      if (active_render_controller === render_controller) {
        active_render_controller = null;
      }
    }
  };

  /**
   * Coalesce bursty context lifecycle events into a single queued render.
   * @returns {void}
   */
  const request_render = () => {
    if (render_queued) return;
    render_queued = true;

    queueMicrotask(() => {
      render_queued = false;
      void render_list_items();
    });
  };

  await render_list_items();
  disposers.push(smart_contexts?.env?.events?.on('context:created', request_render));
  disposers.push(smart_contexts?.env?.events?.on('context:deleted', request_render));
  disposers.push(smart_contexts?.env?.events?.on('context:named', request_render));
  disposers.push(smart_contexts?.env?.events?.on('context:renamed', request_render));
  disposers.push(() => active_render_controller?.abort());

  // cleanup
  this.attach_disposer(container, disposers);
  return container;
}

/**
 * Partition named contexts into root rows and slash-based hierarchy groups.
 *
 * @param {Array<import('smart-contexts').SmartContext>} items
 * @returns {{root_items: Array<import('smart-contexts').SmartContext>, grouped_items: Map<string, Array<{ctx: import('smart-contexts').SmartContext, display_name: string}>>}}
 */
function partition_context_hierarchy(items = []) {
  const root_items = [];
  const grouped_items = new Map();

  for (const ctx of items) {
    const raw_name = String(ctx?.data?.name ?? '').trim();
    const separator_index = raw_name.indexOf('/');
    if (separator_index < 1 || separator_index === raw_name.length - 1) {
      root_items.push(ctx);
      continue;
    }
    const group_name = raw_name.slice(0, separator_index).trim();
    const display_name = raw_name.slice(separator_index + 1).trim();
    if (!group_name || !display_name) {
      root_items.push(ctx);
      continue;
    }
    if (!grouped_items.has(group_name)) {
      grouped_items.set(group_name, []);
    }
    grouped_items.get(group_name).push({ ctx, display_name });
  }

  const compare_names = (a, b) => {
    const left = String(a?.data?.name ?? '').toLocaleLowerCase();
    const right = String(b?.data?.name ?? '').toLocaleLowerCase();
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  };

  root_items.sort(compare_names);

  for (const grouped_contexts of grouped_items.values()) {
    grouped_contexts.sort((left, right) => {
      const left_name = left.display_name.toLocaleLowerCase();
      const right_name = right.display_name.toLocaleLowerCase();
      if (left_name < right_name) return -1;
      if (left_name > right_name) return 1;
      return compare_names(left.ctx, right.ctx);
    });
  }

  return { root_items, grouped_items };
}

/**
 * Resolve whether a hierarchy group should default to open.
 *
 * @param {Array<{ctx: import('smart-contexts').SmartContext}>} grouped_contexts
 * @param {object} params
 * @returns {boolean}
 */
function should_open_group(grouped_contexts = [], params = {}) {
  const item_key = String(params?.item_key ?? '').trim();
  if (!item_key) return false;
  return grouped_contexts.some((grouped_item) => {
    return String(grouped_item?.ctx?.data?.key ?? '') === item_key;
  });
}