import { SuggestModal, Notice, setIcon } from 'obsidian';
import { build_depth_suggestions } from '../utils/context_suggestions.js';

export class CopyContextModal extends SuggestModal {
  constructor(ctx, params = {}) {
    const env = ctx.env;
    const plugin = env.plugin;
    const app = plugin.app;
    super(app);
    this.app = app;
    env.create_env_getter(this);
    this.plugin = plugin;
    this.ctx = ctx;
    this.params = params;
    // add heading to this.titleEl
    this.modalEl.prepend(this.titleEl);
    this.setTitle('Smart Context - Copy to clipboard');
    const button = this.titleEl.createEl('button');
    setIcon(button, 'help-circle');
    button.addEventListener('click', (e) => {
      window.open('https://smartconnections.app/smart-context/clipboard/?utm_source=copy-modal', '_external');
    });
    this.titleEl.style.display = 'flex';
    this.titleEl.style.justifyContent = 'space-between';
    this.titleEl.style.margin = 'var(--size-4-4)';
    setTimeout(() => this.inputEl.focus(), 0); // make sure input is focused (otherwise unfocussed after adding titleEl with button)
  }

  /* ------------------------------------------------------ */

  async onOpen() {
    // const ctx_items = Object.values(this.ctx.context_items.items);
    const ctx_items = this.ctx.context_items.filter((item) => {
      if (item.data.exclude) return false;
      if (item.is_media && !this.params.with_media) return false;
      return true;
    });
    this.suggestions = build_depth_suggestions(ctx_items);
    super.onOpen();
  }

  /* SuggestModal overrides                                  */
  getSuggestions()             { return this.suggestions; }
  renderSuggestion(item, el)   {
    const mode_label = item.include_inlinks ? 'include inlinks' : 'outlinks only';
    el.createDiv({
      text: `Depth ${item.d} (${mode_label}, ${format_suggestion_size(item.size)} chars, ${item.count} items)`,
    });
  }

  async onChooseSuggestion(item) {
    const wait = new Notice('Copying context…', 0);
    await this.ctx.actions.context_copy_to_clipboard({
      filter: (ctx_item) => {
        if (ctx_item.data.d > item.d) return false;
        if (!item.include_inlinks && ctx_item.data.inlink) return false;
        return true;
      },
      max_depth: item.d, // for stats notification
      ...this.params,
    });
    wait.hide();
  }
}

function format_suggestion_size(size) {
  const value = Number(size) || 0;
  if (value >= 10000000) {
    const millions = value / 1000000;
    const rounded = millions >= 10
      ? Math.round(millions)
      : Math.round(millions * 10) / 10;
    return `${rounded}M`;
  }
  if (value >= 10000) {
    const thousands = value / 1000;
    const rounded = thousands >= 10
      ? Math.round(thousands)
      : Math.round(thousands * 10) / 10;
    return `${rounded}K`;
  }
  return value.toLocaleString();
}
