import { ContextBuilderView } from '../../views/context_builder_view.js';

/**
 * Open the review view for this exact Context, including unnamed Contexts.
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params={}]
 * @returns {Promise<ContextBuilderView|null>}
 */
export function context_open_builder_view(params = {}) {
  return ContextBuilderView.open(this.env.obsidian_app.workspace, {
    smart_context: this,
    active: params.active !== false,
  });
}

export const menus = {
  'smart_context:action_menu': {
    title: 'Open in review view',
    icon: 'panel-right',
    order: 1,
    when() {
      return this.params?.surface !== 'context_builder_view';
    },
  },
};
