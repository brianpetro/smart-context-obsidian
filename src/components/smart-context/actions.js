import {
  render_btn_clear_context,
  render_btn_help,
  render_btn_copy_menu,
  render_btn_quick_copy,
} from 'obsidian-smart-env/src/utils/smart-context/copy_actions.js';
import { render_name_input } from '../../utils/named_context_utils.js';

export function build_html() {
  return `
    <div class="sc-context-actions">
      <div class="sc-context-actions-left">
      </div>
      <div class="sc-context-actions-right">
      </div>
    </div>
  `;
}

export async function render(ctx, opts = {}) {
  const html = build_html();
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  post_process.call(this, ctx, container, opts);
  return container;
}

async function post_process(ctx, container, opts = {}) {
  const render_ctx_actions = () => {
    const actions_left = container.querySelector('.sc-context-actions-left');
    this.empty(actions_left);
    render_name_input(ctx, actions_left);
    ctx.env.smart_components.render_component('smart_context_meta', ctx, opts)
      .then((meta) => {
        if (meta) actions_left.appendChild(meta);
      })
    ;
    const actions_right = container.querySelector('.sc-context-actions-right');
    this.empty(actions_right);
    render_btn_quick_copy(ctx, actions_right);
    render_btn_copy_menu(ctx, actions_right, { supports_media: Boolean(ctx?.env?.is_pro) });
    render_btn_clear_context(ctx, actions_right);
    render_btn_help(ctx, actions_right);
  };
  render_ctx_actions();
  const disposers = [];
  disposers.push(ctx.on_event('context:updated', render_ctx_actions));
  this.attach_disposer(container, disposers);

  return container;
}

export const version = '2.2.0';
