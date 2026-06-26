import {
  open_context_selector_for_codeblock,
} from '../../utils/context_codeblock_utils.js';

/**
 * Open the context selector for this codeblock-backed Smart Context.
 *
 * @this {import('smart-contexts').SmartContext}
 * @returns {boolean}
 */
export function context_open_codeblock_builder() {
  open_context_selector_for_codeblock(this);
  return true;
}

export const menus = {
  'smart_context:codeblock_menu': {
    title: 'Open in context builder',
    icon: 'smart-context-builder',
    order: 10,
  },
};
