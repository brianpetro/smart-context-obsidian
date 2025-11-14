import { StoryModal } from 'obsidian-smart-env/modals/story.js';
import { SmartPluginSettingsTab } from 'obsidian-smart-env';

/**
 * A simple plugin settings tab that delegates config to the env.smart_view system.
 */
export class SmartContextSettingTab extends SmartPluginSettingsTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async render_plugin_settings(container) {
    if (!container) return;
    container.empty?.();
    const getting_started_container = container.createDiv({
      cls: 'smart-context-getting-started-container',
    });
    getting_started_container.style.marginBottom = '1em';
    const launch_button = getting_started_container.createEl('button', {
      cls: 'sc-getting-started-button',
      text: 'Getting started guide',
    });
    launch_button.addEventListener('click', () => {
      StoryModal.open(this.plugin, {
        title: 'Getting Started With Smart Context',
        url: 'https://smartconnections.app/story/smart-context-getting-started/?utm_source=context-settings',
      });
    });

    const smart_view = this.env?.smart_view;
    const smart_contexts = this.plugin?.env?.smart_contexts;
    if (!smart_view || !smart_contexts) return;

    Object.entries(smart_contexts.settings_config || {}).forEach(([setting, config]) => {
      const setting_html = smart_view.render_setting_html({
        setting,
        ...config,
      });
      const fragment = smart_view.create_doc_fragment(setting_html);
      if (fragment) container.appendChild(fragment);
    });

    await smart_view.render_setting_components(container, {
      scope: smart_contexts,
    });
  }
}
