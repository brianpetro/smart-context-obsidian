/**
 * Open Lookup results in a new Smart Context.
 *
 * @this {object}
 * @param {object} [params={}]
 * @param {Array<{item: object, score: number}>} [params.results]
 * @returns {boolean}
 */
export function lookup_list_send_to_smart_context(params = {}) {
  const results = Array.isArray(params.results) ? params.results : [];
  const add_items = results
    .filter((result) => result?.item?.key)
    .map((result) => ({
      key: result.item.key,
      score: result.score,
    }))
  ;
  if (!add_items.length) return false;

  const smart_context = this.env.smart_contexts.actions.smart_contexts_open_new({
    add_items,
    event_source: params.event_source || 'lookup_list_send_to_smart_context',
  });
  return Boolean(smart_context);
}

export const menus = {
  'lookup:list_menu': {
    title: 'Open in Context Builder',
    icon: 'smart-context-builder',
    order: 30,
    disabled() {
      return !this.params.results?.some((result) => result?.item?.key);
    },
  },
};

export const version = '1.0.0';
