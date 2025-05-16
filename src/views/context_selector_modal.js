import { FuzzySuggestModal, Keymap } from 'obsidian';

/**
 * @typedef {import('smart-contexts').SmartContext} SmartContext
 */

export class ContextSelectorModal extends FuzzySuggestModal {
  /**
   * @param {import('../../main.js').default} plugin
   * @param {Object} [opts={}]
   * @param {SmartContext} [opts.ctx]
   */
  constructor(plugin, opts = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.opts = opts;
    this.ctx = opts.ctx ?? null;


    this.setInstructions([
      { command: 'Enter',           purpose: 'Add to context' },
      { command: '⌘/Ctrl + Enter',  purpose: 'Open named context in builder' },
      { command: 'Esc',             purpose: 'Close' }
    ]);

    /* inject env so we can access smart_* collections at this.env */
    this.plugin.env.create_env_getter(this);

    /** tracks whether the user held the Mod key when confirming a suggestion */
    this.mod_key_was_held = false;
    this.modalEl.addEventListener('keydown', e => {
      this.mod_key_was_held = Keymap.isModifier(e, 'Mod');
      if (e.key === 'Enter') this.selectActiveSuggestion(e);
      if (e.key === 'Escape') this.close(true);
    });
    this.resultContainerEl.addEventListener('click', e => {
      this.mod_key_was_held = Keymap.isModifier(e, 'Mod');
    });
  }


  async ensure_ctx () {
    if (this.ctx) return this.ctx;
    this.ctx = await this.env.smart_contexts.create_or_update({
      context_items : {},
      key: Date.now().toString(), // prevent collisions with existing contexts
    });
    return this.ctx;
  }

  async open (opts = {}) {
    if (opts.ctx) this.ctx = opts.ctx;
    this.opts = opts;
    await this.render();
    super.open();
  }
  get context_buttons () {
    if(this.suggestions?.length){
      return [
        {
          text: 'Back',
          callback: (ctx) => {
            this.suggestions = null;
            this.close(true);
            this.open({...this.opts, ctx});
          }
        }
      ]
    }
    return this.opts.buttons ?? [];
  }

  async render () {
    this.modalEl.style.display = 'flex';
    this.modalEl.style.flexDirection = 'column';
    this.modalEl.style.height = '100%';

    const prompt_results = this.modalEl.querySelector('.prompt-results');
    if (prompt_results) {
      prompt_results.style.flex        = '1 1 50%';
      prompt_results.style.minHeight   = '0';
      prompt_results.style.overflowY   = 'auto';
    }

    const ctx = await this.ensure_ctx();
    const builder_opts = {
      add_class: 'modal',
      buttons: this.context_buttons,
      reload_callback: (ctx, opts) => {
        this.open({ ctx, ...opts });
      },
      selector_modal : this,
    };
    if(this.opts.add_class) builder_opts.add_class += this.opts.add_class;
    console.log('builder_opts', builder_opts);
    const frag = await this.env.render_component(
      'context_builder',
      ctx,
      builder_opts
    );
    this.modalEl.querySelector('.sc-context-builder')?.remove();
    this.modalEl.prepend(frag);
  }


  getItems () {
    const suggestions = this.suggestions?.filter(s => !this.ctx?.data?.context_items[s.item.key]);
    if(suggestions?.length){
      const special_items = [];
      if(suggestions.some(s => s.depth)){
        const depth_1 = suggestions.filter(s => s.depth <= 1);
        const depth_2 = suggestions.filter(s => s.depth <= 2);
        const depth_3 = suggestions.filter(s => s.depth <= 3);
        if(depth_1.length) special_items.push({
          name: 'Add all to depth 1',
          items: depth_1
        });
        if(depth_2.length) special_items.push({
          name: 'Add all to depth 2',
          items: depth_2
        });
        if(depth_3.length) special_items.push({
          name: 'Add all to depth 3',
          items: depth_3
        });
      }
      if(suggestions.some(s => s.score)){
        special_items.push({
          name: 'Add all connections',
          items: suggestions.filter(s => s.score)
        });
      }
      return [
        ...special_items,
        ...suggestions
      ]
    }
    const unselected = Object.values(this.env.smart_sources.items)
      .filter(src => !this.ctx?.data?.context_items[src.key]);
    return unselected;
  }

  getItemText (item) {
    if(item.score){
      return `${item.score.toFixed(2)} | ${item.item.path}`;
    }
    if(item.depth){
      return `${item.depth} | ${item.item.path}`;
    }
    if(item.items && item.name){
      return item.name;
    }
    return item.path;
  }


  async onChooseSuggestion (selection) {
    console.log('onChooseSuggestion selection', selection);
    await this.ensure_ctx();
    if(selection.item.items){
      console.log('is special item', selection);
      for(const special_item of selection.item.items){
        if(!this.ctx.data.context_items[special_item.item.key]){
          this.ctx.data.context_items[special_item.item.key] = { d: 0 };
        }
      }
      this.updateSuggestions();
      this.render();
      return;
    }
    const item = selection.item?.item ?? selection.item;
    console.log('onChooseSuggestion item', item);

    if (!this.ctx.data.context_items[item.key]) {
      this.ctx.data.context_items[item.key] = { d: 0 };
      this.updateSuggestions();
      this.render();
    }
  }

  focus_input () {
    setTimeout(() => this.inputEl.focus(), 100);
  }

  close (should_close = false) { if (should_close) super.close(); }
  onClose (should_close = false) { if (should_close) super.onClose(); }
  load_suggestions (suggestions) {
    this.suggestions = suggestions;
    this.updateSuggestions();
  }
}
