import { FuzzySuggestModal, Keymap } from 'obsidian';
import { get_all_open_file_paths } from '../utils/get_all_open_file_paths.js';
import { get_visible_open_files } from '../utils/get_visible_open_files.js';
import { send_context_changed_event } from '../utils/send_context_changed_event.js';
import { get_selected_text } from '../utils/get_selected_text.js';

/**
 * @typedef {import('smart-contexts').SmartContext} SmartContext
 */

export class ContextSelectorModal extends FuzzySuggestModal {
  static open(env, opts) {
    const plugin =
      env.smart_context_plugin ||
      env.smart_chat_plugin ||
      env.smart_connections_plugin ||
      env.plugin
    ;
    if (!env.context_selector_modal) {
      if(env.smart_context_plugin?.ContextSelectorModal){
        // handle early-release ContextSelectorModal
        env.context_selector_modal = new env.smart_context_plugin.ContextSelectorModal(plugin, opts);
      }
      else env.context_selector_modal = new this(plugin, opts);
    }
    env.context_selector_modal.open(opts);
    return env.context_selector_modal;
  }
  static close(env) {
    env.context_selector_modal.close(true);
    env.context_selector_modal = null;
  }
  /**
   * @param {import('../../main.js').default} plugin
   * @param {Object} [opts={}]
   * @param {SmartContext} [opts.ctx]
   */
  constructor(plugin, opts = {}) {
    super(plugin.app);
    this.app = plugin.app;
    this.plugin = plugin;
    this.opts = opts;
    this.ctx = opts.ctx ?? null;

    this.setInstructions([
      { command: 'Enter', purpose: 'Add to context' },
      { command: '⌘/Ctrl + Enter', purpose: 'Open named context in builder' },
      { command: 'Esc', purpose: 'Close' },
    ]);

    /* inject env so we can access smart_* collections at this.env */
    this.plugin.env.create_env_getter(this);

    /** tracks whether the user held the Mod key when confirming a suggestion */
    this.mod_key_was_held = false;
    this.containerEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close(true);
    });

    this.modalEl.addEventListener('keydown', (e) => {
      this.mod_key_was_held = Keymap.isModifier(e, 'Mod');
      if (e.key === 'Enter') this.selectActiveSuggestion(e);
    });
    this.resultContainerEl.addEventListener('click', (e) => {
      this.mod_key_was_held = Keymap.isModifier(e, 'Mod');
    });
  }

  /* ───────────────────────────────────────────────────────────── */

  /**
   * Sort an array of context entries according to:
   *   – priority 0 → item has in/out‑links with the current active note
   *   – priority 1 → item modified within the last 24 h
   *   – priority 2 → all remaining items
   * Within each priority group items are ordered alphabetically.
   *
   * @param {Array<Object>} entries
   * @returns {Array<Object>} sorted copy
   */
  sort_context_entries(entries) {
    const active_file = this.app.workspace.getActiveFile();
    let active_src = null;
    if (active_file) {
      active_src = this.env.smart_sources.get(active_file.path);
    }
    const linked_keys = new Set();
    if (active_src) {
      active_src.outlinks.forEach((k) => linked_keys.add(k));
      active_src.inlinks.forEach((k) => linked_keys.add(k));
    }
    const recent_cutoff = Date.now() - 24 * 60 * 60 * 1000;

    const get_key = (entry) =>
      entry?.item?.key || entry?.key || entry?.path || '';
    const get_src = (entry) => entry?.item || entry;

    const priority = (entry) => {
      const key = get_key(entry);
      const src = get_src(entry);
      if (linked_keys.has(key)) return 0;
      if (src?.mtime && src.mtime >= recent_cutoff) return 1;
      return 2;
    };

    return [...entries].sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      return get_key(a).localeCompare(get_key(b));
    });
  }

  /* ───────────────────────────────────────────────────────────── */

  ensure_ctx() {
    if (this.ctx) return this.ctx;
    this.ctx = this.env.smart_contexts.new_context({}, {
      add_items: this.opts.initial_context_items,
    });

    const selected = get_selected_text(this.app);
    if (selected) {
      // Middle-truncate selected text to max 70 chars for the key
      const maxLen = 70;
      let truncated = selected;
      if (selected.length > maxLen) {
        const half = Math.floor((maxLen - 3) / 2);
        truncated = selected.slice(0, half) + '...' + selected.slice(selected.length - half);
      }
      const key = `inline:${truncated}`;
      if (!this.ctx.data.context_items[key]) {
        this.ctx.data.context_items[key] = { content: selected };
      }
    }
    return this.ctx;
  }

  async open(opts = this.opts) {
    if (opts.ctx) this.ctx = opts.ctx;
    if (opts.opener_container) this.add_opener_container(opts.opener_container);
    this.opts = opts;
    await this.render();
    super.open();
    this.focus_input();
  }

  async render() {
    this.modalEl.style.display = 'flex';
    this.modalEl.style.flexDirection = 'column';
    this.modalEl.style.height = '100%';

    const prompt_results = this.modalEl.querySelector('.prompt-results');
    if (prompt_results) {
      prompt_results.style.flex = '1 1 50%';
      prompt_results.style.minHeight = '0';
      prompt_results.style.overflowY = 'auto';
    }

    const ctx = this.ensure_ctx();
    const builder_container = await this.env.render_component(
      'context_builder',
      ctx,
      {
        ...this.opts,
      }
    );
    // add listener to context builder container for custom events
    builder_container.addEventListener('smart-env:context-changed', (e) => {
      const updated_ctx = e.detail.context;
      this.ctx = updated_ctx;
      this.opts.ctx = updated_ctx;
      this.updateSuggestions();
      this.render();
    });

    builder_container.classList.add('modal');
    const actions_el = builder_container.querySelector('.sc-context-actions');
    if (ctx.has_context_items) {
      const clear_btn = document.createElement('button');
      clear_btn.textContent = 'Clear';
      clear_btn.addEventListener('click', () => {
        ctx.data.context_items = {};
        ctx.queue_save();
        ctx.collection.process_save_queue();
        this.updateSuggestions();
        this.render();
      });
      actions_el.appendChild(clear_btn);
      const copy_btn = await this.env.render_component(
        'copy_to_clipboard_button',
        ctx
      );
      actions_el.appendChild(copy_btn);
    }
    if (
      !actions_el.querySelector('button[data-done="true"]')
    ) {
      const done_btn = document.createElement('button');
      done_btn.dataset.done = 'true';
      done_btn.textContent = 'Done';
      done_btn.addEventListener('click', () => {
        this.close(true);
      });
      actions_el.appendChild(done_btn);
    }
    this.modalEl.querySelector('.sc-context-builder')?.remove();
    this.modalEl.prepend(builder_container);
  }

  get suggestions() {
    return this.opts.suggestions ?? [];
  }
  set suggestions(suggestions) {
    this.opts.suggestions = suggestions;
  }

  getItems() {
    const suggestions = this.suggestions?.filter(
      (s) => !this.ctx?.data?.context_items[s.item.key]
    );

    /* existing suggestions mode (connections / depths) */
    if (suggestions?.length) {
      const special_items = [];
      special_items.push({
        name: 'Back',
        items: {},
      });
      if (suggestions.some((s) => s.depth)) {
        const depth_1 = suggestions.filter((s) => s.depth <= 1);
        const depth_2 = suggestions.filter((s) => s.depth <= 2);
        const depth_3 = suggestions.filter((s) => s.depth <= 3);
        if (depth_1.length)
          special_items.push({ name: `Add all to depth 1 (${depth_1.length})`, items: depth_1 });
        if (depth_2.length)
          special_items.push({ name: `Add all to depth 2 (${depth_2.length})`, items: depth_2 });
        if (depth_3.length)
          special_items.push({ name: `Add all to depth 3 (${depth_3.length})`, items: depth_3 });
      }
      if (suggestions.some((s) => s.score)) {
        const all_connections = suggestions.filter((s) => s.score);
        special_items.push({
          name: `Add all connections (${all_connections.length})`,
          items: all_connections,
        });
      }
      return [...special_items, ...suggestions];
    }

    /* default mode – show special items then every un‑selected SmartSource */
    let special_items = this.opts.special_items ?? [];
    const visible_open_files = Array.from(get_visible_open_files(this.app))
      .map(f => {
        return {item: this.env.smart_sources.get(f)};
      })
    ;
    if(visible_open_files.length) {
      special_items.push({
        name: 'Visible open files',
        items: visible_open_files,
      });
      const all_open_files = Array.from(get_all_open_file_paths(this.app))
        .map(f => {
          return {item: this.env.smart_sources.get(f)};
        })
      ;
      if(all_open_files.length && visible_open_files.length !== all_open_files.length) special_items.push({
        name: 'All open files',
        items: all_open_files,
      });
    }
    special_items = special_items
      .map((i) => {
        if (i.items) {
          i.items = i.items.filter(
            (item) => item.item && !this.ctx?.data?.context_items[item.item.key]
          );
          i.name = `${i.name} (+${i.items.length})`;
        }
        return i;
      })
      .filter((i) => {
        if (i.items) return i.items.length > 0;
        return true;
      })
    ;

    const unselected = Object.values(this.env.smart_sources.items).filter(
      (src) => !this.ctx?.data?.context_items[src.key]
    );

    /* sort unselected list: links first → recent → rest */
    const sorted_unselected = this.sort_context_entries(unselected);

    return [...special_items, ...sorted_unselected];
  }

  getItemText(item) {
    if (item.score) {
      return `${item.score.toFixed(2)} | ${item.item.path}`;
    }
    if (item.depth) {
      return `${item.depth} | ${item.item.path}`;
    }
    if (item.items && item.name) {
      return item.name;
    }
    return item.path;
  }

  onChooseSuggestion(selection) {
    if (selection.item.name === 'Back') {
      this.suggestions = null;
      this.updateSuggestions();
      return;
    }
    this.ensure_ctx();
    if (selection.item.items) {
      for (const special_item of selection.item.items) {
        if (!this.ctx.data.context_items[special_item.item.key]) {
          this.ctx.data.context_items[special_item.item.key] = { d: 0 };
        }
      }
      this.updateSuggestions();
      this.render();
      return;
    }
    const item = selection.item?.item ?? selection.item;

    if (!this.ctx.data.context_items[item.key]) {
      this.ctx.data.context_items[item.key] = { d: 0 };
      this.updateSuggestions();
      this.render();
    }
  }

  focus_input() {
    setTimeout(() => this.inputEl.focus(), 100);
  }

  close(should_close = false) {
    if (should_close) super.close();
  }
  onClose(should_close = false) {
    while(this.opener_containers?.length) {
      const container = this.opener_containers.pop();
      if (container.isConnected) {
        send_context_changed_event(container, this.ctx);
      }
    }
  }

  /**
   * Add a container to the list of opener containers.
   * This is used to send context changed events when the modal is closed.
   * @param {HTMLElement|NodeList|Array<HTMLElement>|function} container - The container to add.
   * If a function is passed, it will be called to get the container(s).
   */
  add_opener_container(container) {
    if (!this.opener_containers) this.opener_containers = [];
    if (typeof container === 'function') container = container();
    if (Array.isArray(container) || container instanceof NodeList) {
      container.forEach((c) => this.add_opener_container(c));
      return;
    }
    if(!(container instanceof HTMLElement)) {
      console.warn('ContextSelectorModal: opener_container must be an HTMLElement, received:', container);
      return;
    }
    if (!this.opener_containers.includes(container)) {
      this.opener_containers.push(container);
    }
  }

  load_suggestions(suggestions) {
    this.suggestions = suggestions;
    this.updateSuggestions();
    this.render();
  }


}