import { SuggestModal, setIcon } from 'obsidian';
import {
  build_depth_suggestions,
  build_without_codeblock_depth_zero_context_items,
  estimate_tokens,
  format_context_estimate,
} from '../utils/context_suggestions.js';

const COPY_CONTEXT_MODAL_STYLE_ID = 'sc-copy-context-modal-style';

/**
 * Install CSS for the CopyContextModal once per app session.
 *
 * @returns {void}
 */
function ensure_copy_context_modal_styles_installed() {
  if (document.getElementById(COPY_CONTEXT_MODAL_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = COPY_CONTEXT_MODAL_STYLE_ID;
  style.textContent = `
  .sc-copy-context-modal .sc-copy-modal__suggestion {
    padding: 0;
    margin: 0 8px;
  }

  .sc-copy-context-modal .sc-copy-modal__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    padding: 10px 12px;

    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);

    transition: background-color 120ms ease, border-color 120ms ease;
  }

  .sc-copy-context-modal .sc-copy-modal__suggestion--group-gap .sc-copy-modal__row {
    margin-top: 10px;
  }

  .sc-copy-context-modal .sc-copy-modal__suggestion--group-start .sc-copy-modal__row {
    border-bottom: 0;
    border-radius: 12px 12px 0 0;
  }

  .sc-copy-context-modal .sc-copy-modal__suggestion--group-end .sc-copy-modal__row {
    border-radius: 0 0 12px 12px;
  }

  .sc-copy-context-modal .sc-copy-modal__suggestion--group-start.sc-copy-modal__suggestion--group-end .sc-copy-modal__row {
    border-bottom: 1px solid var(--background-modifier-border);
    border-radius: 12px;
  }

  .sc-copy-context-modal .sc-copy-modal__suggestion.is-selected .sc-copy-modal__row {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover, var(--background-modifier-border));
  }

  .sc-copy-context-modal .sc-copy-modal__left {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .sc-copy-context-modal .sc-copy-modal__depth {
    font-weight: 600;
    white-space: nowrap;
  }

  .sc-copy-context-modal .sc-copy-modal__badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;

    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;

    font-size: var(--font-ui-smaller);
    line-height: 1.6;

    color: var(--text-muted);
    background: var(--background-primary);
    white-space: nowrap;
  }

  .sc-copy-context-modal .sc-copy-modal__badge-icon {
    display: inline-flex;
    align-items: center;
  }

  .sc-copy-context-modal .sc-copy-modal__suggestion--include-inlinks .sc-copy-modal__badge {
    color: var(--text-accent);
    border-color: var(--text-accent);
    background: var(--background-primary);
  }

  .sc-copy-context-modal .sc-copy-modal__right {
    margin-left: auto;
    text-align: right;

    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    white-space: nowrap;

    font-variant-numeric: tabular-nums;
  }
  `;

  document.head.appendChild(style);
}

/**
 * Add grouping metadata to depth suggestions.
 *
 * @param {Array<any>} suggestions
 * @returns {Array<any>}
 */
function decorate_depth_suggestions(suggestions = []) {
  if (!Array.isArray(suggestions)) {
    return [];
  }

  const depth_values = suggestions
    .map((s) => (typeof s?.d === 'number' ? s.d : null))
    .filter((d) => typeof d === 'number');

  const min_depth = depth_values.length ? Math.min(...depth_values) : 0;

  for (let i = 0; i < suggestions.length; i += 1) {
    const item = suggestions[i];
    if (!item) continue;

    const prev = suggestions[i - 1];
    const next = suggestions[i + 1];

    const group_start = !prev || prev.d !== item.d;
    const group_end = !next || next.d !== item.d;

    item._group_start = group_start;
    item._group_end = group_end;
    item._group_gap = group_start && typeof item.d === 'number' && item.d !== min_depth;
  }

  return suggestions;
}

/**
 * Build the special temp context used for "depth 0 without codeblock".
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {import('smart-contexts').SmartContext|null}
 */
function build_without_codeblock_depth_zero_context(ctx) {
  const raw_context_items = Object.values(ctx?.data?.context_items || {});
  const context_items = build_without_codeblock_depth_zero_context_items(raw_context_items);
  if (!Object.keys(context_items).length) {
    return null;
  }

  const Class = ctx?.constructor;
  if (typeof Class !== 'function') {
    return null;
  }

  return new Class(ctx.env, {
    key: `${ctx.key}#temp_copy_current_without_codeblock_depth_0`,
    context_items,
  });
}

/**
 * @param {number} count
 * @returns {string}
 */
function format_items_count(count) {
  const value = Number(count) || 0;
  return value.toLocaleString();
}

/**
 * @param {object} item
 * @returns {{ icon: string, text: string, title: string }}
 */
function get_suggestion_badge(item) {
  if (item?.without_codeblock) {
    return {
      icon: 'minus-circle',
      text: 'No codeblock',
      title: 'Copy the depth 0 context without items added by the note codeblock.',
    };
  }

  if (item?.include_inlinks) {
    return {
      icon: 'arrow-left-right',
      text: 'Include backlinks',
      title: 'Include inlinks (backlinks) in addition to outlinks.',
    };
  }

  if (item?.d === 0) {
    return {
      icon: 'dot',
      text: 'Current note',
      title: 'Only include context items from the root note.',
    };
  }

  return {
    icon: 'arrow-right',
    text: 'Outlinks only',
    title: 'Only include outgoing links from the root note.',
  };
}

/**
 * @param {object} item
 * @returns {string}
 */
function build_suggestion_stats_text(item) {
  const char_text = `${format_context_estimate(item?.size || 0)} chars`;
  const token_text = `${format_context_estimate(estimate_tokens(item?.size || 0))} tokens`;
  const item_text = `${format_items_count(item?.count || 0)} items`;
  return `${char_text} | ${token_text} | ${item_text}`;
}

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
    this.suggestions = [];

    this.modalEl.classList.add('sc-copy-context-modal');

    const instructions = [
      {
        command: 'Enter',
        purpose: 'Copy the context using the selected depth (0 = only the current note, 1 = include linked notes, 2 = links of links).',
      },
    ];
    this.setInstructions(instructions);

    // add heading to this.titleEl
    this.modalEl.prepend(this.titleEl);
    // this.setTitle('Smart Context - Copy to clipboard (choose link depth)');
    this.setTitle('Copy current note as context');

    const button = this.titleEl.createEl('button');
    button.classList.add('clickable-icon');
    button.setAttribute('aria-label', 'Help');
    setIcon(button, 'help-circle');
    button.addEventListener('click', () => {
      window.open(
        'https://smartconnections.app/smart-context/clipboard/?utm_source=copy-modal',
        '_external',
      );
    });

    this.titleEl.style.display = 'flex';
    this.titleEl.style.justifyContent = 'space-between';
    this.titleEl.style.margin = 'var(--size-4-4)';

    setTimeout(() => this.inputEl.focus(), 0); // make sure input is focused (otherwise unfocussed after adding titleEl with button)
  }

  /* ------------------------------------------------------ */

  async onOpen() {
    ensure_copy_context_modal_styles_installed();

    // const ctx_items = Object.values(this.ctx.context_items.items);
    const ctx_items = this.ctx.context_items.filter((item) => {
      if (item.data.exclude) return false;
      if (item.is_media && !this.params.with_media) return false;
      return true;
    });
    const raw_context_items = Object.values(this.ctx?.data?.context_items || {});

    this.suggestions = decorate_depth_suggestions(build_depth_suggestions(ctx_items, {
      raw_context_items,
    }));
    super.onOpen();
  }

  /* SuggestModal overrides                                  */
  getSuggestions() {
    return this.suggestions;
  }

  renderSuggestion(item, el) {
    el.textContent = '';
    el.classList.add('sc-copy-modal__suggestion');

    if (item.without_codeblock) {
      el.classList.add('sc-copy-modal__suggestion--without-codeblock');
    } else if (item.include_inlinks) {
      el.classList.add('sc-copy-modal__suggestion--include-inlinks');
    } else {
      el.classList.add('sc-copy-modal__suggestion--outlinks-only');
    }

    if (item._group_start) {
      el.classList.add('sc-copy-modal__suggestion--group-start');
    }
    if (item._group_end) {
      el.classList.add('sc-copy-modal__suggestion--group-end');
    }
    if (item._group_gap) {
      el.classList.add('sc-copy-modal__suggestion--group-gap');
    }

    const row = el.createDiv({ cls: 'sc-copy-modal__row' });

    const left = row.createDiv({ cls: 'sc-copy-modal__left' });
    left.createSpan({ text: `Depth ${item.d}`, cls: 'sc-copy-modal__depth' });

    const badge_meta = get_suggestion_badge(item);
    const badge = left.createSpan({ cls: 'sc-copy-modal__badge' });
    const badge_icon = badge.createSpan({ cls: 'sc-copy-modal__badge-icon' });
    setIcon(badge_icon, badge_meta.icon);

    badge.setAttribute('title', badge_meta.title);
    badge.createSpan({ text: badge_meta.text });

    row.createDiv({
      cls: 'sc-copy-modal__right',
      text: build_suggestion_stats_text(item),
    });
  }

  async onChooseSuggestion(item) {
    this?.env?.events?.emit?.('context:copy_started', {
      // level: 'info',
      message: 'Copying context...',
      event_source: 'copy_context_modal.onChooseSuggestion',
    });

    if (item?.without_codeblock) {
      const without_codeblock_ctx = build_without_codeblock_depth_zero_context(this.ctx);
      if (!without_codeblock_ctx) {
        this?.env?.events?.emit?.('context:copy_empty', {
          level: 'warning',
          message: 'No non-codeblock depth 0 context items to copy.',
          event_source: 'copy_context_modal.onChooseSuggestion',
        });
        return;
      }

      await without_codeblock_ctx.actions.context_copy_to_clipboard({
        max_depth: 0,
        ...this.params,
      });
      return;
    }

    await this.ctx.actions.context_copy_to_clipboard({
      filter: (ctx_item) => {
        if (ctx_item.data.d > item.d) return false;
        if (!item.include_inlinks && ctx_item.data.inlink) return false;
        return true;
      },
      max_depth: item.d, // for stats notification
      ...this.params,
    });
  }
}
