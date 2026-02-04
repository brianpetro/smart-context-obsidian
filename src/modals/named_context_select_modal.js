/**
 * @file named_context_select_modal.js
 * @description
 * Fuzzy modal for selecting a named SmartContext.
 *
 * - Select: builds a temporary copy-context that includes linked notes up to max_depth (default 3),
 *   then opens CopyContextModal to choose the copy depth.
 * - ⌘/Ctrl+Select: opens Context Selector modal to edit the named context.
 *
 * Notes:
 * - Link traversal is bounded to max_depth for performance.
 * - We do NOT mutate the saved context. We build a temporary SmartContext instance.
 */

import { Keymap, Notice } from 'obsidian';
import { SmartFuzzySuggestModal } from 'obsidian-smart-env/src/modals/smart_fuzzy_suggest_modal.js';
import {
  get_links_to_depth,
  LINK_DIRECTIONS,
} from 'smart-sources/actions/get_links_to_depth.js';

export class NamedContextSelectModal extends SmartFuzzySuggestModal {
  /**
   * @param {import('obsidian').App} app
   * @param {any} plugin
   * @param {object} [params]
   * @param {number} [params.max_depth=3]
   * @param {"out"|"in"|"both"} [params.direction="both"]
   */
  constructor(app, plugin, params = {}) {
    const env = plugin?.env;
    const smart_contexts = env?.smart_contexts;
    super(smart_contexts);

    this.params = { ...params };

    this.setTitle('Smart Context - Select named context');
    this.emptyStateText = 'No named contexts yet.';
    this.setInstructions([
      { command: 'Enter', purpose: 'Copy named context (choose depth)' },
      { command: '⌘/Ctrl + Enter / →', purpose: 'Edit named context' },
      { command: 'Esc', purpose: 'Close' },
    ]);
  }

  open(params = {}) {
    this.params = { ...this.params, ...params };
    this.suggestions = this.get_named_context_suggestions();
    super.open();
  }

  /**
   * Build suggestion list from env.smart_contexts (named only).
   *
   * @returns {Array<{
   *  key: string,
   *  display: string,
   *  ctx: import('smart-contexts').SmartContext,
   *  select_action: Function,
   *  mod_select_action: Function
   * }>}
   */
  get_named_context_suggestions() {
    const smart_contexts = this.env?.smart_contexts;
    const contexts = Array.isArray(smart_contexts?.items)
      ? smart_contexts.items
      : (smart_contexts?.items ? Object.values(smart_contexts.items) : []);

    const named = (contexts || [])
      .filter((ctx) => {
        const name = ctx?.data?.name ? String(ctx.data.name).trim() : '';
        return name.length > 0;
      })
      .sort((a, b) => {
        const a_name = (a?.data?.name || '').toString().toLowerCase();
        const b_name = (b?.data?.name || '').toString().toLowerCase();
        return a_name.localeCompare(b_name);
      });

    return named.map((ctx) => {
      const name = String(ctx.data.name || '').trim();
      const count = typeof ctx.item_count === 'number' ? ctx.item_count : 0;

      return {
        key: ctx?.data?.key || ctx?.key || name,
        display: `${name} (${count} item${count === 1 ? '' : 's'})`,
        ctx,
        select_action: async () => {
          await this.open_copy_modal_for_named_context(ctx);
        },
        mod_select_action: async () => {
          await this.open_builder_for_named_context(ctx);
        },
      };
    });
  }

  /**
   * Override base handling so this modal closes after selection.
   *
   * @param {any} selected
   * @param {KeyboardEvent|MouseEvent} evt
   */
  async onChooseSuggestion(selected, evt) {
    const suggestion = selected?.item || selected;
    const is_arrow_right = this.use_arrow_right;
    const is_mod_select = (evt && Keymap.isModifier(evt, 'Mod')) || this.use_mod_select;

    // reset flags (mirrors SmartFuzzySuggestModal)
    this.use_arrow_right = false;
    this.use_mod_select = false;
    this.use_arrow_left = false;

    const action_key =
      (is_arrow_right || is_mod_select) && typeof suggestion?.mod_select_action === 'function'
        ? 'mod_select_action'
        : 'select_action';

    if (typeof suggestion?.[action_key] !== 'function') {
      new Notice('No action available for selection.');
      this.prevent_close = false;
      super.close();
      return;
    }

    try {
      await suggestion[action_key]({ modal: this, event: evt });
    } catch (err) {
      console.error('NamedContextSelectModal: selection failed', err);
      new Notice('Failed to open named context action.');
    }

    this.prevent_close = false;
    super.close();
  }

  /**
   * Mod+select: open the context builder on the saved context.
   *
   * @param {import('smart-contexts').SmartContext} named_ctx
   */
  async open_builder_for_named_context(named_ctx) {
    if (!named_ctx) return;
    named_ctx.emit_event('context_selector:open');
  }

  /**
   * Select: build a temporary link-expanded context and open CopyContextModal.
   *
   * @param {import('smart-contexts').SmartContext} named_ctx
   */
  async open_copy_modal_for_named_context(named_ctx) {
    if (!named_ctx) return;

    const max_depth =
      typeof this.params?.max_depth === 'number' ? this.params.max_depth : 3;

    const direction =
      this.params?.direction && Object.values(LINK_DIRECTIONS).includes(this.params.direction)
        ? this.params.direction
        : LINK_DIRECTIONS.BOTH;

    const CopyModalClass = this.env?.config?.modals?.copy_context_modal?.class;
    if (!CopyModalClass) {
      new Notice('Copy modal not available.');
      return;
    }

    const wait = new Notice('Building linked context…', 0);

    let copy_ctx = null;
    try {
      copy_ctx = await build_named_context_copy_ctx(named_ctx, {
        max_depth,
        direction,
      });
    } catch (err) {
      console.error('NamedContextSelectModal: build_named_context_copy_ctx failed', err);
      copy_ctx = null;
    } finally {
      wait.hide();
    }

    if (!copy_ctx) {
      new Notice('Failed to build linked context.');
      return;
    }

    const modal = new CopyModalClass(copy_ctx, {
      max_depth,
    });
    modal.open();
  }
}

/* -------------------------------------------------------------------------- */
/*  Link expansion (named context -> temporary copy context)                   */
/* -------------------------------------------------------------------------- */

/**
 * Build a temporary SmartContext that merges:
 * - saved context items
 * - linked sources up to max_depth (bounded)
 *
 * IMPORTANT: does not mutate the saved context.
 *
 * @param {import('smart-contexts').SmartContext} named_ctx
 * @param {object} opts
 * @param {number} opts.max_depth
 * @param {"out"|"in"|"both"} opts.direction
 * @returns {Promise<import('smart-contexts').SmartContext|null>}
 */
async function build_named_context_copy_ctx(named_ctx, opts) {
  if (!named_ctx?.env) return null;

  const max_depth = typeof opts?.max_depth === 'number' ? opts.max_depth : 3;
  const direction =
    opts?.direction && Object.values(LINK_DIRECTIONS).includes(opts.direction)
      ? opts.direction
      : LINK_DIRECTIONS.BOTH;

  const base_items = named_ctx?.data?.context_items || {};
  /** @type {Record<string, any>} */
  const merged_context_items = {};
  /** @type {string[]} */
  const root_keys = [];

  for (const [key, raw] of Object.entries(base_items)) {
    if (!key) continue;

    const item_data = raw && typeof raw === 'object' ? raw : {};
    const item_depth = typeof item_data.d === 'number' ? item_data.d : 0;

    merged_context_items[key] = {
      ...item_data,
      d: item_depth,
    };

    if (item_data.exclude) continue;
    if (item_depth !== 0) continue;
    if (!is_traversable_source_key(named_ctx.env, key)) continue;

    root_keys.push(key);
  }

  const unique_roots = [...new Set(root_keys)];

  for (const root_key of unique_roots) {
    const root_source = named_ctx.env?.smart_sources?.get?.(root_key);
    if (!root_source) continue;

    let graph = [];
    try {
      graph = await get_links_to_depth(root_source, max_depth, {
        direction,
        include_self: true,
      });
    } catch (err) {
      console.warn('build_named_context_copy_ctx: get_links_to_depth failed', root_key, err);
      continue;
    }

    const linked_context_items = build_context_items_from_graph(graph, root_source);
    merge_context_items_min_depth(merged_context_items, linked_context_items);
  }

  // Build a temporary SmartContext instance (not saved / not inserted into collection)
  const base_key = named_ctx?.data?.key || named_ctx?.key || Date.now().toString();
  const temp_key = `${base_key}#copy`;

  const temp_data = {
    ...named_ctx.data,
    key: temp_key,
    context_items: merged_context_items,
  };

  const TempClass = named_ctx.constructor;
  const temp_ctx = new TempClass(named_ctx.env, temp_data);

  // Keep collection reference so actions/env wiring behaves like a normal ctx,
  // but do not set() it into the collection (avoids saving / showing in dashboard).
  temp_ctx.collection = named_ctx.collection;

  return temp_ctx;
}

/**
 * Detect if a context item key should be used as a SmartSource root for traversal.
 *
 * @param {any} env
 * @param {string} key
 * @returns {boolean}
 */
function is_traversable_source_key(env, key) {
  if (typeof key !== 'string' || !key) return false;
  if (key.startsWith('external:')) return false;
  if (key.includes('#')) return false;
  if (!env?.smart_sources?.get) return false;
  return !!env.smart_sources.get(key);
}

/**
 * Build context_items payload from link traversal results.
 * Mirrors logic from smart-context-obsidian/src/actions/source/get_context.js
 *
 * Depth handling:
 *  - Start with graph depth
 *  - Embedded outlinks from the root source are treated as depth 0
 *
 * @param {Array<{ depth:number, item:any }>} graph
 * @param {any|null} root_source
 * @returns {Record<string, { d:number, mtime?:number, size?:number, link?:boolean }>}
 */
function build_context_items_from_graph(graph = [], root_source = null) {
  /** @type {Record<string, any>} */
  const context_items = {};

  const outlinks = root_source?.outlinks;

  for (const entry of graph) {
    if (!entry || !entry.item) continue;

    const item = entry.item;
    const key = item.key;
    if (!key) continue;

    const graph_depth = typeof entry.depth === 'number' ? entry.depth : 0;
    let depth = graph_depth;

    if (Array.isArray(outlinks) && graph_depth > 0 && typeof key === 'string') {
      const embedded_outlink = outlinks.find((o) => {
        return o?.key === key && o?.embedded === true;
      });
      if (embedded_outlink) depth = 0;
    }

    const existing = context_items[key] || {};
    const final_depth =
      typeof existing.d === 'number' ? Math.min(existing.d, depth) : depth;

    context_items[key] = {
      ...existing,
      d: final_depth,
      mtime: item.mtime,
      size: item.size,
      link: true,
    };
  }

  return context_items;
}

/**
 * Merge incoming items into target, ensuring smallest depth wins.
 * Does not override excluded target items.
 *
 * @param {Record<string, any>} target
 * @param {Record<string, any>} incoming
 */
function merge_context_items_min_depth(target, incoming) {
  if (!target || typeof target !== 'object') return;

  for (const [key, raw] of Object.entries(incoming || {})) {
    if (!key) continue;

    const incoming_data = raw && typeof raw === 'object' ? raw : {};
    const incoming_d = typeof incoming_data.d === 'number' ? incoming_data.d : 0;

    const existing = target[key];

    // Never "re-add" items the user explicitly excluded in the saved ctx
    if (existing?.exclude) continue;

    if (!existing) {
      target[key] = {
        ...incoming_data,
        d: incoming_d,
        at: Date.now(),
      };
      continue;
    }

    const existing_d = typeof existing.d === 'number' ? existing.d : 0;

    target[key] = {
      ...existing,
      ...incoming_data,
      d: Math.min(existing_d, incoming_d),
    };
  }
}
