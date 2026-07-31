/**
 * Build Smart Context items from a Connections source and visible results.
 *
 * @param {object} connections_list
 * @param {object} [params={}]
 * @param {Array<{item: object, score: number}>} [params.visible_results]
 * @returns {Array<{key: string, score: number}>}
 */
function get_context_items(connections_list, params = {}) {
  const results = Array.isArray(params.visible_results)
    ? params.visible_results
    : connections_list?.results || []
  ;
  if (!results.length) return [];

  const context_items = [];
  const seen_keys = new Set();
  const append_item = (item, score) => {
    const key = item?.key;
    if (!key || seen_keys.has(key)) return;

    seen_keys.add(key);
    context_items.push({ key, score });
  };

  const source_item = connections_list?.item;
  if (source_item) append_item(source_item, source_item.score ?? 1);

  results.forEach((result) => {
    append_item(result?.item, result?.score);
  });

  return context_items;
}

/**
 * Open visible Connections results in a new Smart Context.
 *
 * @this {object}
 * @param {object} [params={}]
 * @param {Array<{item: object, score: number}>} [params.visible_results]
 * @param {string} [params.event_source]
 * @returns {boolean}
 */
export function connections_list_send_to_context(params = {}) {
  const event_source = params.event_source
    || 'connections_list_send_to_context'
  ;
  const add_items = get_context_items(this, params);
  if (!add_items.length) {
    this.env.events.emit('connections:send_to_context_empty', {
      level: 'warning',
      message: 'No connection results to send to context.',
      event_source,
    });
    return false;
  }

  const open_new_context =
    this.env.smart_contexts?.actions?.smart_contexts_open_new
  ;
  if (typeof open_new_context !== 'function') {
    this.env.events.emit('connections:send_to_context_unavailable', {
      level: 'warning',
      message: 'Smart Context is unavailable.',
      event_source,
    });
    return false;
  }

  const smart_context = open_new_context({
    add_items,
    event_source,
  });
  if (!smart_context) return false;

  this.emit_event('connections:sent_to_context');
  return true;
}

export const menus = {
  'connections:list_menu': {
    title: 'Send to Smart Context',
    icon: 'smart-context-builder',
    order: 20,
    disabled() {
      return !get_context_items(this.scope, this.params).length;
    },
  },
};

export const version = '3.0.0';
