/**
 * Clone JSON-safe context data used by Smart Context items.
 *
 * @param {unknown} value
 * @param {object} [fallback={}]
 * @returns {object}
 */
function clone_context_data(value, fallback = {}) {
  return JSON.parse(JSON.stringify(value || fallback));
}

/**
 * Resolve the copied context name.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @returns {string}
 */
function get_copy_context_name(ctx, params = {}) {
  const requested_name = String(params.context_name || params.name || '').trim();
  if (requested_name) return requested_name;

  const source_name = String(ctx?.data?.name || '').trim();
  if (!source_name) return '';

  return `${source_name} copy`;
}

/**
 * Make an editable copy of the current Smart Context.
 *
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params={}]
 * @param {string} [params.context_name]
 * @param {string} [params.name]
 * @param {boolean} [params.open_selector=true]
 * @returns {import('smart-contexts').SmartContext|null}
 */
export function context_make_copy(params = {}) {
  const collection = this?.collection;
  if (typeof collection?.new_context !== 'function') return null;

  const copy_data = {
    context_items: clone_context_data(this?.data?.context_items),
  };

  if (this?.data?.exclusions) {
    copy_data.exclusions = clone_context_data(this.data.exclusions);
  }

  if (this?.data?.context_opts) {
    copy_data.context_opts = clone_context_data(this.data.context_opts);
  }

  const context_name = get_copy_context_name(this, params);
  if (context_name) copy_data.name = context_name;

  const copied_context = collection.new_context(copy_data);
  if (!copied_context) return null;

  this.emit_event?.('context:made_copy', {
    copy_key: copied_context.key,
    copy_name: copied_context.data?.name,
    event_source: params.event_source || 'context_make_copy',
  });

  if (params.open_selector !== false) {
    copied_context.emit_event?.('context_selector:open', {
      event_source: params.event_source || 'context_make_copy',
    });
  }

  return copied_context;
}

const action_menu = {
  title: 'Make a copy',
  icon: 'copy',
  order: 10,
  when() {
    return Number(this.scope?.item_count || 0) > 0
      || Number(this.scope?.excluded_item_count || 0) > 0
      || Boolean(this.scope?.data?.name)
    ;
  },
};

export const menus = {
  'smart_context:action_menu': action_menu,
};
