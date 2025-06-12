import { build_context_items_tree_html } from '../utils/build_context_items_tree_html.js';
import context_tree_css from './context_tree.css' with { type: 'css' };
import { get_links_to_depth } from 'smart-sources/actions/get_links_to_depth.js';
import { open_note } from 'obsidian-smart-env/utils/open_note.js';
import { getIcon } from 'obsidian';
import { ContextSelectorModal } from '../views/context_selector_modal.js';
import { register_block_hover_popover } from 'obsidian-smart-env/utils/register_block_hover_popover.js';

/* ─────────────────────────── Pure helpers ─────────────────────────── */

/**
 * test_has_children
 * @param {HTMLElement} li
 * @returns {boolean}
 */
const test_has_children = li => !!li.querySelector(':scope > ul');

/**
 * toggle_collapsed
 * Adds / removes `.collapsed` on the given <li>.
 * @param {HTMLElement} li
 */
export const toggle_collapsed = li => li.classList.toggle('collapsed');

/**
 * setup_collapse_handlers
 * Walks each expandable <li> and wires click‑to‑toggle.
 * @param {HTMLElement} container – root .sc-context-tree
 */
export const setup_collapse_handlers = container => {
  container.querySelectorAll('.sc-tree-item.dir').forEach(li => {
    if (!test_has_children(li)) return;
    li.classList.add('expandable');
    const label = li.querySelector(':scope > .sc-tree-label');
    if (!label) return;

    /* click – toggle collapsed */
    label.addEventListener('click', ev => {
      // allow modifier‑click to keep existing open‑note behaviour
      if (ev.metaKey || ev.ctrlKey) return;
      ev.preventDefault();
      ev.stopPropagation();
      toggle_collapsed(li);
    });
  });
};

/* ─────────────────────────── Component API ─────────────────────────── */

const get_selected_items = ctx =>
  Object.keys(ctx?.data?.context_items || {}).map(k => ({ path: k }));

export function build_html(ctx) {
  const items = get_selected_items(ctx);
  const tree_list_html = build_context_items_tree_html(items);
  return `<div>
    <div class="sc-context-tree">${tree_list_html || '<em>No items selected…</em>'}</div>
  </div>`;
}

export async function render(ctx, opts = {}) {
  const html = build_html(ctx);
  const frag = this.create_doc_fragment(html);
  this.apply_style_sheet(context_tree_css);
  const container = frag.querySelector('.sc-context-tree');
  await post_process.call(this, ctx, container, opts);
  return container;
}

export async function post_process(ctx, container, opts = {}) {
  const env = ctx?.env;
  const plugin =
    env?.smart_context_plugin ||
    env?.smart_chat_plugin ||
    env?.smart_connections_plugin;
  const ContextSelectorModalClass = plugin.ContextSelectorModal || ContextSelectorModal;

  const render_tree = () => {
    const items = get_selected_items(ctx);
    const tree_list_html = build_context_items_tree_html(items);
    this.safe_inner_html(container, tree_list_html || '<em>No items selected…</em>');
    attach_item_handlers();
    setup_collapse_handlers(container); // ⬅ collapsible
  };

  const update_callback = _ctx => {
    render_tree();
    opts.update_callback?.(_ctx);
  };

  /* ───────────── Handlers for remove / connections / links ───────────── */
  const attach_item_handlers = () => {
    if (!opts.disable_context_changes) {
      container.querySelectorAll('.sc-tree-remove').forEach(btn => {
        btn.title = `Remove ${btn.dataset.path}`;
        btn.addEventListener('click', e => {
          const p = e.currentTarget.dataset.path;
          delete ctx.data.context_items[p];
          update_callback(ctx);
        });
      });
      container.querySelectorAll('.sc-tree-connections').forEach(btn => {
        const icon = getIcon('smart-connections');
        btn.appendChild(icon);
        btn.addEventListener('click', async e => {
          const p = e.currentTarget.dataset.path;
          const target = ctx.get_ref(p);
          const connections = await target.find_connections();
          const modal = ContextSelectorModalClass.open(env, {
            ctx,
            update_callback: opts.update_callback
          });
          modal.load_suggestions(connections);
        });
      });
      container.querySelectorAll('.sc-tree-links').forEach(btn => {
        if (!btn.dataset.path) return;
        const target = ctx.get_ref(btn.dataset.path);
        if (!target) return;
        const links = get_links_to_depth(target, 3);
        if (!links.length) return;
        const icon = getIcon('link');
        btn.appendChild(icon);
        btn.addEventListener('click', () => {
          const p = btn.dataset.path;
          const target = ctx.get_ref(p);
          if (!target) return;
          const links = get_links_to_depth(target, 3);
          const modal = ContextSelectorModalClass.open(env, {
            ctx,
            update_callback: opts.update_callback
          });
          modal.load_suggestions(links);
        });
      });
    }

    /* link open / drag + hover (existing) */
    container.querySelectorAll('.sc-tree-label').forEach(label => {
      const li = label.closest('.sc-tree-item');
      if (!li) return;
      const item_path = li.dataset.path;
      if (!item_path) return;

      label.dataset.href = item_path;
      label.dataset.path = item_path;
      label.setAttribute('draggable', 'true');
      label.title = item_path;

      if (item_path.includes('{')) {
        register_block_hover_popover(li, label, env, item_path, plugin);
      } else {
        label.addEventListener('mouseover', async ev => {
          plugin?.app?.workspace.trigger('hover-link', {
            event: ev,
            source: 'smart-context-tree',
            hoverParent: label,
            targetEl: label,
            linktext: item_path
          });
        });
      }
      label.addEventListener('dragstart', ev => {
        const file_path = item_path.split('#')[0];
        const file = plugin?.app?.metadataCache?.getFirstLinkpathDest(file_path, '');
        const drag_data = plugin?.app?.dragManager?.dragFile(ev, file);
        plugin?.app?.dragManager?.onDragStart(ev, drag_data);
      });
      if(!li.classList.contains('sc-external')) {
        label.addEventListener('click', ev => {
          if (!li.classList.contains('dir') || ev.metaKey || ev.ctrlKey) {
            ev.preventDefault();
            open_note(plugin, item_path, ev, { new_tab: true });
          }
        });
      }
    });
  };

  render_tree();
  return container;
}
