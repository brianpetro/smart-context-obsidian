import { SuggestModal, Notice, setIcon } from 'obsidian';
import { build_depth_suggestions } from '../utils/context_suggestions.js';

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
  }

  .sc-copy-context-modal .sc-copy-modal__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    margin: 0 8px;
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
 * @param {number} count
 * @returns {string}
 */
function format_items_count(count) {
  const value = Number(count) || 0;
  return value.toLocaleString();
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

    // add heading to this.titleEl
    this.modalEl.prepend(this.titleEl);
    this.setTitle('Smart Context - Copy to clipboard (choose link depth)');

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

    this.suggestions = decorate_depth_suggestions(build_depth_suggestions(ctx_items));
    super.onOpen();
  }

  /* SuggestModal overrides                                  */
  getSuggestions() {
    return this.suggestions;
  }

  renderSuggestion(item, el) {
    el.textContent = '';
    el.classList.add('sc-copy-modal__suggestion');

    if (item.include_inlinks) {
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

    const badge = left.createSpan({ cls: 'sc-copy-modal__badge' });
    const badge_icon = badge.createSpan({ cls: 'sc-copy-modal__badge-icon' });
    setIcon(badge_icon, item.include_inlinks ? 'arrow-left-right' : 'arrow-right');

    badge.setAttribute(
      'title',
      item.include_inlinks
        ? 'Include inlinks (backlinks) in addition to outlinks.'
        : 'Only include outgoing links from the root note.',
    );

    badge.createSpan({ text: item.include_inlinks ? 'Include backlinks' : 'Outlinks only' });

    row.createDiv({
      cls: 'sc-copy-modal__right',
      text: `${format_suggestion_size(item.size)} chars | ${format_items_count(item.count)} items`,
    });
  }

  async onChooseSuggestion(item) {
    const wait = new Notice('Copying context...', 0);
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
