import styles from './codeblock.css';
import { Menu, setIcon } from 'obsidian';
import {
  convert_codeblock_to_named_context,
  open_context_selector_for_codeblock,
} from '../../utils/context_codeblock_utils.js';

function build_html() {
  return `<div>
    <div class="sc-context-codeblock-container">
      <div class="cb-actions">
        <div class="cb-actions-left">
          <button class="clickable-icon sc-codeblock-menu" type="button" aria-label="Context actions"></button>
          <button class="clickable-icon context-cb-open-builder" type="button" aria-label="Add/edit context"></button>
          <button class="clickable-icon sc-copy-clipboard" type="button" aria-label="Copy context"></button>
          <button class="clickable-icon sc-codeblock-help" type="button" aria-label="Help"></button>
        </div>
        <div class="cb-actions-right">
          <div class="cb-meta"></div>
        </div>
      </div>
    </div>
  </div>`;
}

/**
 * @param {Menu} menu
 * @param {MouseEvent|KeyboardEvent} event
 * @param {HTMLElement} anchor_el
 * @returns {void}
 */
function show_menu(menu, event, anchor_el) {
  if (event instanceof MouseEvent) {
    menu.showAtMouseEvent(event);
    return;
  }

  const rect = anchor_el.getBoundingClientRect();
  if (typeof menu.showAtPosition === 'function') {
    menu.showAtPosition({ x: rect.left, y: rect.bottom });
    return;
  }

  menu.showAtMouseEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left,
    clientY: rect.bottom,
  }));
}

/**
 * @param {HTMLElement} button
 * @param {string} label
 * @returns {void}
 */
function set_button_label(button, label) {
  if (!button) return;
  // button.title = label; // NO using both title and aria-label as it causes double tooltip
  button.setAttribute('aria-label', label);
}

export async function render(ctx, opts = {}) {
  this.apply_style_sheet(styles);
  const html = build_html();
  const frag = this.create_doc_fragment(html);
  const container = frag.querySelector('.sc-context-codeblock-container');
  post_process.call(this, ctx, container, opts);
  return container;
}

export async function post_process(ctx, container, params = {}) {
  const meta_container = container.querySelector('.cb-meta');
  const open_builder_btn = container.querySelector('.context-cb-open-builder');
  const menu_btn = container.querySelector('.sc-codeblock-menu');
  const copy_btn = container.querySelector('.sc-copy-clipboard');
  const help_btn = container.querySelector('.sc-codeblock-help');
  const app = ctx?.env?.plugin?.app || window.app || null;

  const render_ctx_meta = async () => {
    this.empty(meta_container);
    const meta = await ctx.env.smart_components.render_component('smart_context_meta', ctx, { ...params });
    if (meta) meta_container.appendChild(meta);
  };

  const update_action_state = () => {
    const has_active_items = (ctx?.item_count || 0) > 0;
    const builder_label = has_active_items ? 'Open context builder' : 'Add context';

    set_button_label(menu_btn, 'Context actions');
    set_button_label(open_builder_btn, builder_label);
    set_button_label(help_btn, 'Help');

    copy_btn.hidden = !has_active_items;
    copy_btn.disabled = !has_active_items;
    set_button_label(
      copy_btn,
      has_active_items ? 'Copy to clipboard' : 'No context items to copy',
    );
  };

  open_builder_btn.addEventListener('click', () => {
    open_context_selector_for_codeblock(ctx);
  });

  const open_actions_menu = (event) => {
    if (!app) return;

    const menu = new Menu(app);
    menu.addItem((item) => {
      item
        .setTitle('Create named context')
        .setIcon('smart-named-contexts')
        .onClick(() => {
          convert_codeblock_to_named_context(ctx);
        })
      ;
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle('Open context builder')
        .setIcon('smart-context-builder')
        .onClick(() => {
          open_context_selector_for_codeblock(ctx);
        })
      ;
    });
    menu.addItem((item) => {
      item
        .setTitle('Copy context to clipboard')
        .setIcon('smart-copy-note')
        .setDisabled(!ctx?.item_count)
        .onClick(async () => {
          await ctx.actions.context_copy_to_clipboard();
        })
      ;
    });
    menu.addItem((item) => {
      item
        .setTitle('Open named contexts dashboard')
        .setIcon('smart-named-contexts')
        .onClick(() => {
          app.commands.executeCommandById('smart-context:smart-contexts-dashboard');
        })
      ;
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle('Help')
        .setIcon('help-circle')
        .onClick(() => {
          window.open('https://smartconnections.app/smart-context/codeblock/?utm_source=codeblock-menu', '_external');
        })
      ;
    });

    show_menu(menu, event, menu_btn);
  };

  menu_btn.addEventListener('click', (event) => {
    event.preventDefault();
    open_actions_menu(event);
  });
  menu_btn.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open_actions_menu(event);
  });

  copy_btn.addEventListener('click', async () => {
    if (copy_btn.disabled) return;
    await ctx.actions.context_copy_to_clipboard();
  });

  setIcon(open_builder_btn, 'smart-context-builder');
  setIcon(menu_btn, 'menu');
  setIcon(copy_btn, 'smart-copy-note');
  setIcon(help_btn, 'help-circle');
  help_btn.addEventListener('click', () => {
    window.open('https://smartconnections.app/smart-context/codeblock/?utm_source=codeblock-help', '_external');
  });

  update_action_state();
  render_ctx_meta();

  const disposers = [];
  disposers.push(ctx.on_event('context:updated', async () => {
    update_action_state();
    await render_ctx_meta();
  }));
  this.attach_disposer(container, disposers);
  return container;
}

export const version = '2.1.1';
