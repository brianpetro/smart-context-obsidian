import { get_truncated_context_selections } from '../../utils/context_output_guard.js';

export const version = '3.1.5';

const media_extension_re = /\.(?:png|jpe?g|gif|bmp|webp|ico|svg|avif|pdf)$/i;

export function build_html() {
  return '<div class="sc-context-builder-ui-summary" aria-live="polite"></div>';
}

/**
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {any} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function render(ctx, params = {}) {
  const frag = this.create_doc_fragment(build_html());
  const container = frag.firstElementChild;
  post_process.call(this, ctx, container, params);
  return container;
}

/**
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {any} params
 * @returns {HTMLElement}
 */
export function post_process(ctx, container, params = {}) {
  const observed_missing_keys = new Set();

  const render_summary = () => {
    const summary = get_context_summary(ctx, {
      observed_missing_keys,
      context_items: params.get_context_items?.(),
      exclusion_count: params.get_exclusion_count?.(),
    });

    container.replaceChildren();
    append_segment(container, get_source_summary_text(summary));

    if (summary.estimated_tokens > 0) {
      append_segment(
        container,
        `~${format_context_estimate(summary.estimated_tokens)} tokens`,
      );
    }
    if (summary.media_count > 0) {
      append_segment(
        container,
        `${summary.media_count} media (${format_byte_count(summary.media_bytes)})`,
      );
    }
    if (summary.exclusion_count > 0) {
      const exclusion_button = append_segment(
        container,
        `${summary.exclusion_count} rule${summary.exclusion_count === 1 ? '' : 's'}`,
        'sc-context-builder-ui-chip sc-context-builder-ui-chip-neutral sc-context-builder-exclusions-trigger',
        params.on_exclusions_click,
      );
      if (params.on_exclusions_click) {
        exclusion_button.setAttribute(
          'aria-expanded',
          String(params.is_exclusions_open?.() === true),
        );
        const controls_id = params.get_exclusions_controls_id?.();
        if (controls_id) exclusion_button.setAttribute('aria-controls', controls_id);
      }
    }
    if (summary.truncated_selection_count > 0) {
      append_segment(
        container,
        `${summary.truncated_selection_count} truncated`,
        'sc-context-builder-ui-chip sc-context-builder-ui-chip-warning',
        params.on_truncated_click,
      );
    }
    if (summary.missing_count > 0) {
      append_segment(
        container,
        `${summary.missing_count} missing`,
        'sc-context-builder-ui-chip sc-context-builder-ui-chip-warning',
        params.on_missing_click,
      );
    }
    if (summary.pending_update_count > 0) {
      append_segment(
        container,
        'Updates on copy',
        'sc-context-builder-ui-chip sc-context-builder-ui-chip-neutral',
      );
    }

    params.on_summary?.(summary);
  };
  params.on_ready?.(render_summary);
  render_summary();
  this.attach_disposer(container, [
    ctx.on_event('context:updated', render_summary),
    ctx.on_event('smart_context:missing_item', (payload = {}) => {
      if (payload.missing_key) observed_missing_keys.add(payload.missing_key);
      render_summary();
    }),
    ctx.on_event('context:missing_item_removed', (payload = {}) => {
      if (payload.removed_key) observed_missing_keys.delete(payload.removed_key);
      render_summary();
    }),
    () => params.on_ready?.(null),
  ]);
  return container;
}

/**
 * Build a cached presentation summary without constructing another
 * ContextItems collection. The review tree performs the normal hydration pass
 * before this component renders.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {any} [params={}]
 * @returns {any}
 */
export function get_context_summary(ctx, params = {}) {
  const selection_entries = Object.entries(ctx?.data?.context_items || {})
    .filter(([, item_data]) => item_data?.exclude !== true)
  ;
  if (Array.isArray(params.context_items)) {
    return build_hydrated_summary(
      ctx,
      params.context_items,
      selection_entries,
      params,
    );
  }

  const source_keys = new Set();
  const missing_keys = new Set();
  let source_count = 0;
  let source_count_known = true;
  let estimated_text_chars = 0;
  let media_count = 0;
  let media_bytes = 0;

  selection_entries.forEach(([key, item_data = {}]) => {
    if (item_data.folder === true || item_data.named_context === true) {
      const group_items_ct = Number(item_data.group_items_ct);
      if (Number.isFinite(group_items_ct) && group_items_ct >= 0) {
        source_count += group_items_ct;
      } else {
        source_count += 1;
        source_count_known = false;
      }
      return;
    }

    const item_key = String(item_data.key || key || '').trim();
    if (!item_key || source_keys.has(item_key)) return;
    source_keys.add(item_key);
    source_count += 1;

    if (is_missing_item(item_data)) missing_keys.add(item_key);

    const item_size = normalize_size(item_data.size);
    if (media_extension_re.test(item_key.split('#')[0])) {
      media_count += 1;
      media_bytes += item_size;
    } else {
      estimated_text_chars += item_size;
    }
  });

  add_observed_missing_keys(
    missing_keys,
    new Set(),
    ctx,
    params.observed_missing_keys,
  );
  add_missing_named_contexts(missing_keys, ctx, selection_entries);

  return {
    selection_count: selection_entries.length,
    source_count,
    source_count_known,
    estimated_text_chars,
    estimated_tokens: estimate_tokens(estimated_text_chars),
    media_count,
    media_bytes,
    exclusion_count: get_exclusion_count(ctx, params.exclusion_count),
    truncated_selection_count: get_truncated_context_selections(ctx).length,
    missing_count: missing_keys.size,
    pending_update_count: get_pending_update_count(ctx, source_keys),
  };
}

/**
 * Build the exact summary from the tree's already-resolved context items.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {Array<any>} context_items
 * @param {Array<[string, any]>} selection_entries
 * @param {any} params
 * @returns {any}
 */
function build_hydrated_summary(ctx, context_items, selection_entries, params) {
  const source_keys = new Set();
  const existing_keys = new Set();
  const missing_keys = new Set();
  let estimated_text_chars = 0;
  let media_count = 0;
  let media_bytes = 0;

  context_items.forEach((item) => {
    const item_key = String(item?.key || item?.path || '').trim();
    if (!item_key || source_keys.has(item_key)) return;
    source_keys.add(item_key);

    if (is_missing_item(item)) missing_keys.add(item_key);
    else existing_keys.add(item_key);

    const item_size = normalize_size(item?.size ?? item?.data?.size);
    if (item?.is_media === true) {
      media_count += 1;
      media_bytes += item_size;
    } else {
      estimated_text_chars += item_size;
    }
  });

  add_observed_missing_keys(
    missing_keys,
    existing_keys,
    ctx,
    params.observed_missing_keys,
  );
  add_missing_named_contexts(missing_keys, ctx, selection_entries);

  return {
    selection_count: selection_entries.length,
    source_count: source_keys.size,
    source_count_known: true,
    estimated_text_chars,
    estimated_tokens: estimate_tokens(estimated_text_chars),
    media_count,
    media_bytes,
    exclusion_count: get_exclusion_count(ctx, params.exclusion_count),
    truncated_selection_count: get_truncated_context_selections(ctx).length,
    missing_count: missing_keys.size,
    pending_update_count: get_pending_update_count(ctx, source_keys),
  };
}

/**
 * @param {number} char_count
 * @returns {number}
 */
export function estimate_tokens(char_count = 0) {
  const value = Number(char_count);
  return Number.isFinite(value) && value > 0 ? Math.ceil(value / 4) : 0;
}

/**
 * @param {number} value
 * @returns {string}
 */
export function format_context_estimate(value = 0) {
  const numeric_value = Number(value);
  if (!Number.isFinite(numeric_value) || numeric_value <= 0) return '0';
  if (numeric_value < 1000) return Math.ceil(numeric_value).toLocaleString();

  const thousands = numeric_value / 1000;
  return thousands < 10
    ? `${Number.parseFloat(thousands.toFixed(1))}K`
    : `${Math.ceil(thousands)}K`
  ;
}

/**
 * @param {number} byte_count
 * @returns {string}
 */
export function format_byte_count(byte_count = 0) {
  const numeric_count = Number(byte_count);
  if (!Number.isFinite(numeric_count) || numeric_count <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = numeric_count;
  let unit_index = 0;
  while (value >= 1024 && unit_index < units.length - 1) {
    value /= 1024;
    unit_index += 1;
  }

  const precision = value >= 10 || Number.isInteger(value) ? 0 : 1;
  return `${Number.parseFloat(value.toFixed(precision))} ${units[unit_index]}`;
}

/**
 * @param {any} summary
 * @returns {string}
 */
function get_source_summary_text(summary) {
  if (summary.source_count_known === false) {
    return `${summary.selection_count} selection${summary.selection_count === 1 ? '' : 's'}`;
  }
  if (summary.source_count <= 0) return 'No sources selected';
  if (summary.selection_count > 0 && summary.selection_count !== summary.source_count) {
    return `${summary.source_count} sources from ${summary.selection_count} selections`;
  }
  return `${summary.source_count} source${summary.source_count === 1 ? '' : 's'}`;
}

/**
 * @param {HTMLElement} container
 * @param {string} text
 * @param {string} [class_name='']
 * @param {Function} [on_click]
 * @returns {HTMLElement}
 */
function append_segment(container, text, class_name = '', on_click) {
  if (on_click) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = class_name;
    button.textContent = text;
    button.addEventListener('click', /** @type {EventListener} */ (on_click));
    container.appendChild(button);
    return button;
  }

  const span = document.createElement('span');
  span.className = class_name;
  span.textContent = text;
  container.appendChild(span);
  return span;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalize_size(value) {
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

/**
 * @param {any} item
 * @returns {boolean}
 */
function is_missing_item(item) {
  return item?.exists === false
    || item?.missing === true
    || item?.data?.missing === true
    || item?.data?.exists === false
    || item?.is_gone === true
  ;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {unknown} [override]
 * @returns {number}
 */
function get_exclusion_count(ctx, override) {
  const override_count = Number(override);
  if (Number.isFinite(override_count)) return Math.max(0, override_count);

  const exclusion_count = Number(ctx?.excluded_item_count);
  return Number.isFinite(exclusion_count)
    ? Math.max(0, exclusion_count)
    : Object.keys(ctx?.data?.exclusions || {}).length
  ;
}

/**
 * @param {Set<string>} missing_keys
 * @param {Set<string>} existing_keys
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {Iterable<string>|undefined} observed_missing_keys
 * @returns {void}
 */
function add_observed_missing_keys(
  missing_keys,
  existing_keys,
  ctx,
  observed_missing_keys,
) {
  const context_items = ctx?.data?.context_items || {};
  for (const raw_key of observed_missing_keys || []) {
    const missing_key = String(raw_key || '').trim();
    if (!missing_key || existing_keys.has(missing_key)) continue;

    const item_data = context_items[missing_key];
    if (!item_data) continue;
    if (
      item_data.named_context === true
      && ctx.env.smart_contexts?.get_named_context?.(
        String(item_data.key || missing_key).trim(),
      )
    ) {
      continue;
    }

    missing_keys.add(missing_key);
  }
}

/**
 * @param {Set<string>} missing_keys
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {Array<[string, any]>} selection_entries
 * @returns {void}
 */
function add_missing_named_contexts(missing_keys, ctx, selection_entries) {
  selection_entries.forEach(([key, item_data = {}]) => {
    if (item_data.named_context !== true) return;
    const context_name = String(item_data.key || key || '').trim();
    if (!ctx?.env?.smart_contexts?.get_named_context?.(context_name)) {
      missing_keys.add(key);
    }
  });
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {Set<string>} source_keys
 * @returns {number}
 */
function get_pending_update_count(ctx, source_keys) {
  if (!source_keys.size) return 0;

  const source_paths = new Set(
    Array.from(source_keys).map((key) => key.split('#')[0]),
  );
  return Object.keys(ctx?.env?.smart_sources?.sources_re_import_queue || {})
    .filter((key) => source_paths.has(key))
    .length
  ;
}
