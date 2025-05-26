import { build_context_items_tree_html } from '../utils/build_context_items_tree_html.js';
import context_builder_css from './context_builder.css' with { type : 'css' };
import { get_links_to_depth } from 'smart-sources/actions/get_links_to_depth.js';
import { open_note } from 'obsidian-smart-env/utils/open_note.js';
import { getIcon } from 'obsidian';

const estimate_tokens = char_count => Math.ceil(char_count / 4);
const get_selected_items = (ctx) => {
  return Object.keys(ctx?.data?.context_items || {})
    .map(k => ({path: k}))
}

/**
 * build_html
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {Object} opts
 * @returns {string}
 */
export function build_html (ctx, opts = {}) {
  const { show_name_input = false } = opts;

  const items = get_selected_items(ctx);

  const tree_list_html = build_context_items_tree_html(items);

  return `<div>
    <div class="sc-context-builder${opts.add_class ? ` ${opts.add_class}` : ''}">
      <div class="sc-context-header">
        <div class="sc-stats" aria-live="polite"></div>
        <input
          type="text"
          class="sc-context-name"
          placeholder="Context name…"
          aria-label="Context name"
          ${show_name_input ? '' : 'style="display:none;"'}
        />
        <div class="sc-context-actions"></div>
      </div>
      <div class="sc-selected-tree">${tree_list_html || '<em>No items selected…</em>'}</div>
    </div>
  </div>`;
}

/* render() remains the same except we pass opts through */
export async function render (ctx, opts = {}) {
  const html  = build_html.call(this, ctx, opts);
  const frag  = this.create_doc_fragment(html);
  ctx.container = frag.querySelector('.sc-context-builder');
  this.apply_style_sheet(context_builder_css);
  await post_process.call(this, ctx, ctx.container, opts);
  return ctx.container;
}

/*───────────────────────────────────────────────────────────────────────────*\
  internal behaviour – with hover, drag, titles, cursors
\*───────────────────────────────────────────────────────────────────────────*/

export async function post_process (ctx, container, opts = {}) {
  const env        = ctx?.env;
  const plugin     = env?.smart_context_plugin || env?.smart_chat_plugin || env?.smart_connections_plugin;
  const tree_el    = container.querySelector('.sc-selected-tree');
  const stats_el   = container.querySelector('.sc-stats');
  const header_el  = container.querySelector('.sc-context-header');
  const actions_el = header_el.querySelector('.sc-context-actions');

  const render_tree = () => {
    const items          = get_selected_items(ctx);
    const tree_list_html = build_context_items_tree_html(items);
    this.safe_inner_html(tree_el, tree_list_html || '<em>No items selected…</em>');
    attach_item_handlers();
    update_stats();
  };

  const attach_item_handlers = () => {
    /* remove btn */
    tree_el.querySelectorAll('.sc-tree-remove').forEach(btn => {
      btn.title = `Remove ${btn.dataset.path}`;
      btn.addEventListener('click', e => {
        const p = e.currentTarget.dataset.path;
        delete ctx.data.context_items[p];
        render_tree();
        opts.changed_callback?.(ctx, opts);
      });
    });
    /* connections btn */
    tree_el.querySelectorAll('.sc-tree-connections').forEach(btn => {
      const connections_icon = getIcon('smart-connections');
      btn.appendChild(connections_icon);
      btn.addEventListener('click', async e => {
        const p      = e.currentTarget.dataset.path;
        const target = ctx.get_ref(p);
        const connections = await target.find_connections();
        if(!opts.selector_modal) {
          opts.selector_modal = opts.open_selector_callback?.(ctx, opts);
        }else opts.selector_modal.open(opts);
        opts.selector_modal?.load_suggestions(connections);
      });
    });
    /* links btn */
    tree_el.querySelectorAll('.sc-tree-links').forEach(btn => {
      const links_icon = getIcon('link');
      btn.appendChild(links_icon);
      btn.addEventListener('click', e => {
        const p      = e.currentTarget.dataset.path;
        const target = ctx.get_ref(p);
        const links  = get_links_to_depth(target, 3);
        if(!opts.selector_modal) {
          opts.selector_modal = opts.open_selector_callback?.(ctx, opts);
        }else opts.selector_modal.open(opts);
        opts.selector_modal?.load_suggestions(links);
      });
    });
    /* label: hover, drag, click */
    tree_el.querySelectorAll('.sc-tree-label').forEach(label => {
      const parent_li = label.closest('.sc-tree-item');
      if(!parent_li) return;
      const item_path = parent_li.dataset.path;
      if(!item_path) return;

      label.classList.add('internal-link');
      label.dataset.href  = item_path;
      label.dataset.path  = item_path;
      label.setAttribute('draggable', 'true');
      label.title = item_path;

      /* hover preview */
      label.addEventListener('mouseover', ev => {
        plugin?.app?.workspace.trigger('hover-link', {
          event: ev,
          source: 'smart-context-builder',
          hoverParent: label,
          targetEl: label,
          linktext: item_path
        });
      });
      /* drag support */
      label.addEventListener('dragstart', ev => {
        const file_path = item_path.split('#')[0];
        const file      = plugin?.app?.metadataCache?.getFirstLinkpathDest(file_path, '');
        const drag_data = plugin?.app?.dragManager?.dragFile(ev, file);
        plugin?.app?.dragManager?.onDragStart(ev, drag_data);
      });
      /* click open */
      label.addEventListener('click', ev => {
        ev.preventDefault();
        open_note(plugin, item_path, ev, { new_tab : true });
      });
    });
  };

  const update_stats = async () => {
    const items = get_selected_items();
    if (!items.length) {
      stats_el.textContent = '';
      return;
    }
    const { stats }    = await ctx.compile({ link_depth : 0, calculating : true });
    const total_chars  = stats.char_count;
    const total_tokens = estimate_tokens(total_chars);
    stats_el.textContent = `≈ ${total_chars.toLocaleString()} chars · ${total_tokens.toLocaleString()} tokens`;
  };

  const render_actions = (_buttons) => {
    _buttons = _buttons.filter((btn, index, self) =>
      index === self.findLastIndex((t) => t.text === btn.text)
    );
    for (const btn of _buttons) {
      if (btn.display_callback && !btn.display_callback(ctx)) continue;
      const el = document.createElement('button');
      el.textContent = btn.text;
      el.addEventListener('click', (e) => {
        btn.callback(ctx, opts, e);
      });
      actions_el.appendChild(el);
    }
  };

  const buttons = [
    ...(opts.buttons ?? [])
  ];
  if(opts.reload_callback){
    buttons.push({
      text: 'New',
      display_callback: (ctx) => ctx.has_context_items,
      callback: async (ctx, opts) => {
        const new_ctx = await ctx.collection.create_or_update({
          context_items : {},
          key: Date.now().toString(),
        });
        reload_context_builder(new_ctx, opts);
      }
    });
  }

  render_actions(buttons);
  render_tree();
}

export function reload_context_builder(ctx, opts) {
  if (opts.reload_callback) {
    opts.reload_callback(ctx, opts);
  } else {
    console.warn('No reload callback provided');
  }
}
