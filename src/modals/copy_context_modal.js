import { SuggestModal, Notice } from 'obsidian';

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
  }

  /* ------------------------------------------------------ */

  async onOpen() {
    const ctx_items = Object.values(this.ctx.context_items.items);
    const max_depth = Math.max(
      ...ctx_items.map((item) => (typeof item.data.d === 'number' ? item.data.d : 0))
    );
    const suggestions = ctx_items
      .reduce((acc, item) => {
        if(typeof item.data.d === 'number') {
          for(let d = item.data.d; d <= max_depth; d++) {
            if(!acc[d]) {
              acc[d] = { d: d, size: 0, sizes: 0, count: 0 };
            }
            acc[d].count += 1;
            if(typeof item.size === 'number') {
              if(item.size > 0) {
                acc[d].size += item.size;
                acc[d].sizes += 1;
              }
            }
          }
        }
        return acc;
      }, Array.from({ length: max_depth + 1 }));
    ;
    this.suggestions = suggestions.filter(Boolean);
    super.onOpen();
  }

  /* SuggestModal overrides                                  */
  getSuggestions()             { return this.suggestions; }
  renderSuggestion(item, el)   {
    el.createDiv({ text: `Depth ${item.d} (${item.size} chars, ${item.sizes} items)` });
  }

  async onChooseSuggestion(item) {
    const wait = new Notice('Copying context…', 0);
    await this.ctx.actions.context_copy_to_clipboard({
      filter: (ctx_item) => {
        return ctx_item.data.d <= item.d;
      },
      ...this.params,
    });
    wait.hide();
  }
}
