import styles from './settings_tab.css';

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
  render_component('collection_settings', smart_contexts).then((settings_container) => {
    contexts_container.appendChild(settings_container);
  });

  const context_items = env.context_items;
  const context_items_container = container.querySelector('.context-items');
  render_component('collection_settings', context_items).then((settings_container) => {
    context_items_container.appendChild(settings_container);
  });
}