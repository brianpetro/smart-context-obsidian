import { StoryModal } from 'obsidian-smart-env/modals/story.js';
import { PluginSettingTab } from 'obsidian';

/**
 * A simple plugin settings tab that delegates config to the env.smart_view system.
 */
export class SmartContextSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.env = plugin.env;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const gs_container = containerEl.createEl('div', {
      cls: 'smart-context-getting-started-container',
    });
    gs_container.style.marginBottom = '1em';
    gs_container.createEl('button', {
      cls: 'sc-getting-started-button',
      text: 'Getting started guide',
    });
    gs_container.querySelector('.sc-getting-started-button').addEventListener('click', () => {
      StoryModal.open(this.plugin, {
        title: 'Getting Started With Smart Context',
        url: 'https://smartconnections.app/story/smart-context-getting-started/?utm_source=context-settings',
      });
    });

    Object.entries(this.plugin.env.smart_contexts.settings_config).forEach(
      ([setting, config]) => {
        const setting_html = this.env.smart_view.render_setting_html({
          setting,
          ...config,
        });
        const frag = this.env.smart_view.create_doc_fragment(setting_html);
        containerEl.appendChild(frag);
      }
    );

    this.env.smart_view.render_setting_components(containerEl, {
      scope: this.plugin.env.smart_contexts,
    });
  }
}
