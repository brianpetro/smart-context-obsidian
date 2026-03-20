/**
 * @file named_context_select_modal.js
 * @description
 * Fuzzy modal for selecting a named SmartContext.
 *
 * - Select: builds a temporary link-expanded context and opens CopyContextModal
 *   so the user can choose copy depth/backlink handling.
 * - Mod+Select: opens Context Selector modal to edit the saved named context.
 *
 * Notes:
 * - Link traversal is bounded to max_depth for performance.
 * - We do NOT mutate the saved context. We build a temporary SmartContext instance.
 */

import { Keymap } from 'obsidian';
import { SmartFuzzySuggestModal } from 'obsidian-smart-env/src/modals/smart_fuzzy_suggest_modal.js';
import { LINK_DIRECTIONS } from 'smart-sources/actions/get_links_to_depth.js';
import { build_named_context_copy_context } from '../utils/temp_context_utils.js';

export class NamedContextSelectModal extends SmartFuzzySuggestModal {
  /**
   * @param {import('obsidian').App} app
   * @param {any} plugin
   * @param {object} [params]
   * @param {number} [params.max_depth=3]
   * @param {'out'|'in'|'both'} [params.direction='both']
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
      : (smart_contexts?.items ? Object.values(smart_contexts.items) : [])
    ;

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
        : 'select_action'
    ;

    if (typeof suggestion?.[action_key] !== 'function') {
      this?.env?.events?.emit?.('context:named_context_selection_missing_action', {
        level: 'warning',
        message: 'No action available for selection.',
        event_source: 'named_context_select_modal.onChooseSuggestion',
      });
      this.prevent_close = false;
      super.close();
      return;
    }

    try {
      await suggestion[action_key]({ modal: this, event: evt });
    } catch (err) {
      console.error('NamedContextSelectModal: selection failed', err);
      this?.env?.events?.emit?.('context:named_context_selection_failed', {
        level: 'error',
        message: 'Failed to open named context action.',
        details: err?.message || '',
        event_source: 'named_context_select_modal.onChooseSuggestion',
      });
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
      typeof this.params?.max_depth === 'number' ? this.params.max_depth : 3
    ;

    const direction =
      this.params?.direction && Object.values(LINK_DIRECTIONS).includes(this.params.direction)
        ? this.params.direction
        : LINK_DIRECTIONS.BOTH
    ;

    const CopyModalClass = this.env?.config?.modals?.copy_context_modal?.class;
    if (!CopyModalClass) {
      this?.env?.events?.emit?.('context:copy_modal_missing', {
        level: 'warning',
        message: 'Copy modal not available.',
        event_source: 'named_context_select_modal.open_copy_modal_for_named_context',
      });
      return;
    }

    this?.env?.events?.emit?.('context:named_context_build_started', {
      level: 'info',
      message: 'Building linked context…',
      event_source: 'named_context_select_modal.open_copy_modal_for_named_context',
    });

    let copy_ctx = null;
    try {
      copy_ctx = await build_named_context_copy_context(named_ctx, {
        max_depth,
        direction,
      });
    } catch (err) {
      console.error('NamedContextSelectModal: build_named_context_copy_context failed', err);
      copy_ctx = null;
    }

    if (!copy_ctx) {
      this?.env?.events?.emit?.('context:named_context_build_failed', {
        level: 'error',
        message: 'Failed to build linked context.',
        event_source: 'named_context_select_modal.open_copy_modal_for_named_context',
      });
      return;
    }

    const modal = new CopyModalClass(copy_ctx, {
      max_depth,
    });
    modal.open();
  }
}
