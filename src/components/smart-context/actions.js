import {
  render_btn_clear_context,
  render_btn_help,
  render_btn_copy_menu,
  render_btn_quick_copy,
} from 'obsidian-smart-env/src/utils/smart-context/copy_actions.js';
import {
  get_context_name_input_value,
  persist_context_name,
  resolve_name_status,
} from '../../utils/actions_utils.js';

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
    const actions_right = container.querySelector('.sc-context-actions-right');
    this.empty(actions_right);
    render_btn_quick_copy(ctx, actions_right);
    render_btn_copy_menu(ctx, actions_right);
    render_btn_clear_context(ctx, actions_right);
    render_btn_help(ctx, actions_right);
  };
  render_ctx_actions();
  const disposers = [];
  disposers.push(ctx.on_event('context:updated', render_ctx_actions));
  this.attach_disposer(container, disposers);

  return container;
}

export function render_name_input(ctx, container) {
  const name_wrapper = document.createElement('div');
  name_wrapper.className = 'sc-context-name-wrapper';
  name_wrapper.style.display = 'flex';
  name_wrapper.style.alignItems = 'center';
  name_wrapper.style.gap = 'var(--size-4-2)';
  container.appendChild(name_wrapper);

  const name_input = document.createElement('input');
  name_input.type = 'text';
  name_input.className = 'sc-context-name-input';
  name_input.placeholder = 'Context name…';
  name_input.setAttribute('aria-label', 'Context name');
  name_wrapper.appendChild(name_input);

  const status_span = document.createElement('span');
  status_span.className = 'sc-context-name-status';
  status_span.setAttribute('aria-label', 'Context saved status');
  status_span.setAttribute('aria-live', 'polite');
  status_span.hidden = true;
  name_wrapper.appendChild(status_span);

  const update_name_status = () => {
    const status = resolve_name_status(ctx, { input_value: name_input.value });
    status_span.textContent = status.label;
    status_span.hidden = !status.label;
    status_span.dataset.state = status.is_saved ? 'saved' : 'idle';
  };

  const refresh_name = () => {
    name_input.value = get_context_name_input_value(ctx);
    update_name_status();
  };

  const save_name = () => {
    const next_name = sanitize_context_name(name_input.value);
    const current_name = get_context_name_input_value(ctx);

    if (next_name === current_name) {
      update_name_status();
      return;
    }

    const result = persist_context_name(ctx, {
      input_value: next_name,
      open_selector: false,
    });

    name_input.value = result?.context_name ?? next_name;
    refresh_name();
  };

  refresh_name();

  name_input.addEventListener('keydown', (e) => {
    // Intentionally allow default keydown behavior (e.g., text input, navigation)
    // Prevent event bubbling to avoid parent handlers interfering
    e.stopPropagation();
    if (e.key === 'Enter') {
      save_name();
      name_input.blur();
    }
    if (e.key === 'Escape') {
      refresh_name();
      name_input.blur();
    }
  });
  name_input.addEventListener('blur', () => save_name());
  name_input.addEventListener('input', () => update_name_status());

  function sanitize_context_name(name) {
    const str = String(name ?? '').trim();
    if (!str) return '';
    const collapsed = str.replace(/\s+/g, ' ');
    const max = 120;
    return collapsed.length > max ? collapsed.slice(0, max) : collapsed;
  }
}

export const version = '2.2.0';
