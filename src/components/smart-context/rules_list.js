import { setIcon } from 'obsidian';
import styles from './rules_list.css';

export const version = '3.1.7';

/**
 * Return directly selected named-context inclusion rules.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {Array<{ storage_key: string, name: string }>}
 */
export function get_named_context_rules(ctx) {
  return Object.entries(ctx?.data?.context_items || {})
    .filter(([, item_data]) => item_data?.named_context === true)
    .map(([storage_key, item_data]) => ({
      storage_key,
      name: String(item_data?.key || storage_key || '').trim(),
    }))
    .filter((rule) => rule.storage_key && rule.name)
    .sort((left, right) => left.name.localeCompare(right.name))
  ;
}

/**
 * Remove one directly selected named-context rule from this build.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {string} storage_key
 * @returns {boolean}
 */
export function remove_named_context_rule(ctx, storage_key = '') {
  const key = String(storage_key || '').trim();
  const context_items = ctx?.data?.context_items;
  if (!key || context_items?.[key]?.named_context !== true) return false;

  delete context_items[key];
  ctx.queue_save?.();
  ctx.emit_event?.('context:updated', {
    removed_key: key,
    removed_keys: [key],
    removed_inclusion: key,
    event_source: 'context_rules.remove_named_context',
  });
  return true;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {string}
 */
export function build_html(ctx) {
  return `<div class="sc-context-rules-list" data-context-key="${ctx?.data?.key || ''}"></div>`;
}

/**
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function render(ctx, params = {}) {
  this.apply_style_sheet(styles);
  const frag = this.create_doc_fragment(build_html(ctx));
  const container = frag.firstElementChild;
  post_process.call(this, ctx, container, params);
  return container;
}

/**
 * Render a minimal rule list for Core. Pro replaces this component with its
 * full include/exclude rule review surface through component versioning.
 *
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @param {boolean} [params.review_mode=false]
 * @param {Function} [params.on_close]
 * @param {Function} [params.on_exclusion_count_change]
 * @param {Function} [params.on_ready]
 * @returns {HTMLElement}
 */
export function post_process(ctx, container, params = {}) {
  let compact_open = false;
  let rules = [];
  let last_rule_count = -1;

  const focus_review = () => {
    container.querySelector('.sc-context-rules-title')?.focus?.();
  };

  const render_rules = () => {
    rules = get_named_context_rules(ctx);
    container.replaceChildren();
    container.hidden = params.review_mode !== true && rules.length === 0;
    container.dataset.ruleCount = String(rules.length);
    container.dataset.exclusionCount = '0';

    if (params.review_mode === true) {
      render_review_surface(container, rules);
    } else if (rules.length > 0) {
      render_compact_surface(container, rules);
    }

    if (rules.length !== last_rule_count) {
      last_rule_count = rules.length;
      params.on_exclusion_count_change?.(rules.length);
    }
  };

  const render_review_surface = (target, current_rules) => {
    const review = target.createDiv({
      cls: 'sc-context-rules-review',
    });

    const back_btn = review.createEl('button', {
      cls: 'sc-context-rules-back',
      attr: {
        type: 'button',
        'data-rule-action': 'back',
      },
    });
    const back_icon = back_btn.createSpan({
      cls: 'sc-context-rules-button-icon',
    });
    setIcon(back_icon, 'arrow-left');
    back_btn.append('Included context');

    review.createEl('h3', {
      cls: 'sc-context-rules-title',
      text: current_rules.length
        ? `Context rules (${current_rules.length})`
        : 'Context rules',
      attr: {
        tabindex: '-1',
      },
    });

    review.createDiv({
      cls: 'sc-context-rules-description',
      text: 'Named contexts dynamically include their current sources. Remove a rule to stop including that context in this build.',
    });

    if (!current_rules.length) {
      review.createDiv({
        cls: 'sc-context-rules-empty',
        text: 'No named-context rules in this build.',
      });
      return;
    }

    render_rule_list(review, current_rules);
  };

  const render_compact_surface = (target, current_rules) => {
    const details = target.createEl('details', {
      cls: 'sc-context-rules-details',
    });
    details.open = compact_open;
    details.addEventListener('toggle', () => {
      compact_open = details.open;
    });

    details.createEl('summary', {
      cls: 'sc-context-rules-summary',
      text: `Rules (${current_rules.length})`,
    });
    render_rule_list(details, current_rules);
  };

  const render_rule_list = (target, current_rules) => {
    const list = target.createEl('ul', {
      cls: 'sc-context-rules-items',
    });

    current_rules.forEach((rule) => {
      const named_ctx = ctx?.env?.smart_contexts?.get_named_context?.(rule.name);
      const row = list.createEl('li', {
        cls: 'sc-context-rules-item',
      });

      const icon = row.createSpan({
        cls: 'sc-context-rules-icon',
      });
      setIcon(icon, 'smart-named-contexts');

      const copy = row.createDiv({
        cls: 'sc-context-rules-copy',
      });
      copy.createDiv({
        cls: 'sc-context-rules-label',
        text: rule.name,
      });
      copy.createDiv({
        cls: 'sc-context-rules-meta',
        text: named_ctx
          ? 'Named context inclusion'
          : 'Named context inclusion - missing context',
      });

      const actions = row.createDiv({
        cls: 'sc-context-rules-actions',
      });
      const open_btn = actions.createEl('button', {
        text: 'Open context',
        attr: {
          type: 'button',
          'data-rule-action': 'open',
          'data-rule-name': rule.name,
          'aria-label': `Open named context ${rule.name}`,
        },
      });
      open_btn.disabled = !named_ctx;

      actions.createEl('button', {
        text: 'Remove',
        attr: {
          type: 'button',
          'data-rule-action': 'remove',
          'data-rule-key': rule.storage_key,
          'aria-label': `Remove named context inclusion ${rule.name}`,
        },
      });
    });
  };

  const on_click = (event) => {
    const action_btn = event.target?.closest?.('[data-rule-action]');
    if (!action_btn || !container.contains(action_btn)) return;

    event.preventDefault();
    event.stopPropagation();

    const action = action_btn.dataset.ruleAction;
    if (action === 'back') {
      params.on_close?.();
      return;
    }
    if (action === 'remove') {
      remove_named_context_rule(ctx, action_btn.dataset.ruleKey);
      return;
    }
    if (action === 'open') {
      open_named_context(ctx, action_btn.dataset.ruleName);
    }
  };

  render_rules();
  params.on_ready?.(focus_review);
  container.addEventListener('click', on_click);

  this.attach_disposer(container, [
    ctx.on_event('context:updated', render_rules),
    () => container.removeEventListener('click', on_click),
    () => params.on_ready?.(null),
  ]);
  return container;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {string} context_name
 * @returns {boolean}
 */
function open_named_context(ctx, context_name = '') {
  const name = String(context_name || '').trim();
  const named_ctx = name
    ? ctx?.env?.smart_contexts?.get_named_context?.(name)
    : null
  ;
  if (!named_ctx) return false;

  if (typeof named_ctx.collection?.open_builder === 'function') {
    named_ctx.collection.open_builder(named_ctx, {
      event_source: 'context_rules.open_named_context',
    });
    return true;
  }

  named_ctx.emit_event?.('context_selector:open', {
    event_source: 'context_rules.open_named_context',
  });
  return true;
}
