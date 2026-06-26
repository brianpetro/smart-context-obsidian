/**
 * Resolve whether the Smart Context can be deleted from named-context surfaces.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {boolean}
 */
function can_delete_context(ctx) {
  const context_name = String(ctx?.data?.name ?? '').trim();
  return context_name.length > 0;
}

/**
 * Delete the current named Smart Context.
 *
 * Dashboard menus pass `confirm_delete` so the row can show its inline
 * confirmation UI before the destructive action runs.
 *
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params={}]
 * @param {Function} [params.confirm_delete]
 * @returns {boolean}
 */
export function context_delete_context(params = {}) {
  if (typeof params.confirm_delete === 'function') {
    params.confirm_delete(this, params);
    return true;
  }

  if (!can_delete_context(this)) return false;

  const context_name = String(this?.data?.name ?? '').trim();
  this.delete?.();
  this.emit_event?.('context:deleted', {
    name: context_name,
    event_source: params.event_source || 'context_delete_context',
  });
  return true;
}

export const menus = {
  'smart_context:action_menu': {
    title: 'Delete context',
    icon: 'trash',
    order: 1000,
    when() {
      if(typeof this.params.confirm_delete === 'undefined') return false;
      return can_delete_context(this.scope);
    },
  },
};
