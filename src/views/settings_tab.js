import { StoryModal } from 'obsidian-smart-env/src/modals/story.js';
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

    this.env.smart_components.render_component('smart_context_settings_tab', this).then((settings_container) => {
      container.appendChild(settings_container);
    });
  }
}
