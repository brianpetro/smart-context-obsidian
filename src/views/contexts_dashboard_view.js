import { SmartItemView } from 'obsidian-smart-env/views/smart_item_view.js';

export const CONTEXTS_DASHBOARD_VIEW_TYPE = 'smart-contexts-dashboard';

export class ContextsDashboardView extends SmartItemView {
  static get view_type() { return CONTEXTS_DASHBOARD_VIEW_TYPE; }
  static get display_text() { return 'Management dashboard (show named contexts)'; }
  static get icon_name() { return 'layout-dashboard'; }

  async render_view(params = {}) {
    const dashboard = await this.env.render_component(
      'smart_context_list',
      this.env.smart_contexts,
      { ...params },
    );
    dashboard.classList.add('item-view');
    this.container.empty();
    this.container.append(dashboard);
  }
}
