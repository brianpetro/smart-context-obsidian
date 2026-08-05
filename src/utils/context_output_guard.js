/**
 * Resolve an item's known source size.
 *
 * @param {any} item
 * @returns {number}
 */
function get_item_size(item) {
  const size = Number(item?.size ?? item?.data?.size);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

/**
 * Summarize a resolved output selection before an expensive export begins.
 *
 * @param {Array<any>} context_items
 * @returns {{ item_count:number, total_size:number }}
 */
export function get_context_output_size(context_items = []) {
  const items = Array.isArray(context_items) ? context_items : [];
  return {
    item_count: items.length,
    total_size: items.reduce((sum, item) => sum + get_item_size(item), 0),
  };
}

/**
 * Return the first violated output limit.
 *
 * @param {Array<any>} context_items
 * @param {object} params
 * @param {number} [params.max_items]
 * @param {number} [params.max_bytes]
 * @param {string} [params.output_label='Output']
 * @returns {{ item_count:number, total_size:number, message:string }|null}
 */
export function get_context_output_limit_error(context_items = [], params = {}) {
  const {
    max_items,
    max_bytes,
    output_label = 'Output',
  } = params;
  const { item_count, total_size } = get_context_output_size(context_items);
  const exceeds_items = Number.isFinite(max_items) && item_count > max_items;
  const exceeds_bytes = Number.isFinite(max_bytes) && total_size > max_bytes;
  if (!exceeds_items && !exceeds_bytes) return null;

  const limit_parts = [];
  if (Number.isFinite(max_items)) {
    limit_parts.push(`${max_items.toLocaleString()} items`);
  }
  if (Number.isFinite(max_bytes)) {
    limit_parts.push(format_byte_count(max_bytes));
  }

  return {
    item_count,
    total_size,
    message: `${output_label} is limited to ${limit_parts.join(' or ')}. `
      + `This selection has ${item_count.toLocaleString()} items (${format_byte_count(total_size)}). `
      + 'Reduce the selection before continuing.',
  };
}

/**
 * Return durable folder selections whose hydration stopped at a safety cap.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {Array<{ key:string, max_items:number }>}
 */
export function get_truncated_context_selections(ctx) {
  const truncated = new Map();
  const visited = new Set();

  const collect = (source_ctx) => {
    if (!source_ctx || visited.has(source_ctx)) return;
    visited.add(source_ctx);

    Object.entries(source_ctx?.data?.context_items || {})
      .forEach(([key, item_data = {}]) => {
        const item_key = String(item_data?.key || key || '').trim();
        if (item_data.truncated === true && item_key) {
          truncated.set(item_key, {
            key: item_key,
            max_items: Number(item_data.truncated_max_items) || 0,
          });
        }

        if (item_data.named_context !== true || !item_key) return;
        const named_ctx = source_ctx?.env?.smart_contexts
          ?.get_named_context?.(item_key)
        ;
        collect(named_ctx);
      });

    const named_contexts = Array.isArray(source_ctx.named_contexts)
      ? source_ctx.named_contexts
      : []
    ;
    named_contexts.forEach(collect);
  };

  collect(ctx);
  return Array.from(truncated.values());
}

/**
 * Require an explicit acknowledgement before exporting a context known to be
 * incomplete because a folder scan reached its safety cap.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @param {boolean} [params.allow_truncated]
 * @param {(message:string)=>boolean} [params.confirm_truncated]
 * @param {string} [params.action_label='continue']
 * @param {string} [params.event_source='context_output_guard']
 * @returns {boolean}
 */
export function confirm_truncated_context(ctx, params = {}) {
  const truncated = get_truncated_context_selections(ctx);
  if (!truncated.length || params.allow_truncated === true) return true;

  const paths = truncated
    .slice(0, 3)
    .map((item) => item.key)
    .join(', ')
  ;
  const remaining_count = Math.max(0, truncated.length - 3);
  const path_text = remaining_count
    ? `${paths}, and ${remaining_count} more`
    : paths
  ;
  const action_label = params.action_label || 'continue';
  const message = `Some selected folders were truncated while resolving context: ${path_text}. `
    + `The output will be incomplete. Continue and ${action_label}?`
  ;
  const confirm_fn = typeof params.confirm_truncated === 'function'
    ? params.confirm_truncated
    : (typeof activeWindow?.confirm === 'function'
      ? (confirm_message) => activeWindow.confirm(confirm_message)
      : null)
  ;

  try {
    if (confirm_fn?.(message)) return true;
  } catch (error) {
    console.warn('Smart Context: Failed to confirm truncated output', error);
  }

  ctx?.emit_event?.('context:truncated_output_blocked', {
    level: 'warning',
    message: 'Output cancelled because one or more selected folders were truncated.',
    truncated_keys: truncated.map((item) => item.key),
    event_source: params.event_source || 'context_output_guard',
  });
  return false;
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
