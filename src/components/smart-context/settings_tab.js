import styles from './settings_tab.css';
import { render_settings_config } from "obsidian-smart-env/src/utils/render_settings_config.js";

async function build_html(settings_tab, params = {}) {
  return `<div class="smart-context-settings-tab">
    <div class="smart-contexts"></div>
    <div class="context-items"></div>
  </div>`;
}

/**
 * Render environment settings as a DocumentFragment
 */
export async function render(settings_tab, params = {}) {
  this.apply_style_sheet(styles);
  const html = await build_html.call(this, settings_tab, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, settings_tab, container, params);
  return frag;
}

/**
 * Sets up event listeners for toggling, fuzzy modals, re-rendering exclusion lists, etc.
 */
export async function post_process(settings_tab, container, params = {}) {
  const env = settings_tab.env;
  const render_component = env.smart_components?.render_component.bind(env.smart_components);
  
  const smart_contexts = env.smart_contexts;
  const contexts_container = container.querySelector('.smart-contexts');
  render_settings_config(
    smart_contexts.settings_config,
    smart_contexts,
    contexts_container,
    {
      default_group_name: 'Smart Contexts',
      heading_btn: [
        {
          label: 'Settings documentation for Contexts Templates',
          btn_icon: 'help-circle',
          callback: () => window.open('https://smartconnections.app/smart-context/settings/?utm_source=context-settings-tab#context-templates', '_external'),
        }
      ],
    }
  )

  const context_items = env.context_items;
  const context_items_container = container.querySelector('.context-items');
  render_settings_config(
    context_items.settings_config,
    context_items,
    context_items_container,
    {
      default_group_name: 'Context Items',
      heading_btn: [
        {
          label: 'Settings documentation for Context Items',
          btn_icon: 'help-circle',
          callback: () => window.open('https://smartconnections.app/smart-context/settings/?utm_source=context-settings-tab#context-items', '_external'),
        }
      ],
    }
  )
}