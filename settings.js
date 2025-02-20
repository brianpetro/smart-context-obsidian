/******************************************************
 * main.js
 * @fileoverview
 * Obsidian plugin entry point for Smart Context.
 ******************************************************/
import {
  PluginSettingTab
} from 'obsidian';

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
