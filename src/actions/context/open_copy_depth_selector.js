import {
  is_copy_context_depth_available,
  smart_context_action_scope,
} from '../../utils/copy_context_depth.js';

export const display_name = 'Choose copy link depth';
export const action_scope = smart_context_action_scope;

/**
 * Open the configured link-depth selector for the current Smart Context.
 *
 * @this {import('smart-contexts').SmartContext}
 * @returns {boolean}
 */
export function context_open_copy_depth_selector() {
  const modal_class =
    this?.env?.config?.modals?.copy_context_modal?.class;
  if (typeof modal_class !== 'function') return false;

  const modal = new modal_class(this);
  if (typeof modal?.open !== 'function') return false;

  modal.open();
  return true;
}

export const menus = {
  'smart_context:copy_depth_menu': {
    title: 'Choose link depth...',
    icon: 'network',
    order: -1,

    when() {
      return is_copy_context_depth_available(this.scope, 0)
        && typeof this.scope?.env?.config?.modals
          ?.copy_context_modal?.class === 'function'
      ;
    },
  },
};
