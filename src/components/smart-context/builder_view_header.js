import {
  get_context_description_input_value,
  persist_context_description,
} from '../../utils/actions_utils.js';

export const version = '1.0.1';

export function build_html() {
  return `
    <div class="sc-context-builder-header">
      <div class="sc-context-builder-header-copy">
        <div class="sc-context-builder-origin-row">
          <span class="sc-context-builder-origin"></span>
          <button class="sc-context-builder-origin-undo" type="button" hidden>Undo</button>
        </div>
        <div class="sc-context-builder-name"></div>
        <button class="sc-context-builder-description-preview" type="button" aria-label="Edit context description" aria-expanded="false"></button>
      </div>
      <div class="sc-context-builder-primary">
        <div class="sc-context-builder-view-brand">Smart Context</div>
      </div>
      <div class="sc-context-builder-description-editor" hidden>
        <textarea class="sc-context-builder-description-input" rows="3" placeholder="What this context contains and when to use it" aria-label="Context description"></textarea>
        <div class="sc-context-builder-description-actions">
          <button type="button">Cancel</button>
          <button type="button" class="mod-cta" title="Save description (Ctrl/Cmd+Enter)">Save</button>
        </div>
      </div>
      <div class="sc-context-builder-view-meta">
        <div class="sc-context-builder-summary"></div>
        <div class="sc-context-builder-source-nav">
          <div class="sc-context-builder-source-modes" role="group" aria-label="Context source types"></div>
          <div class="sc-context-builder-source-description"></div>
        </div>
      </div>
    </div>
  `.trim();
}

/**
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function render(ctx, params = {}) {
  const frag = this.create_doc_fragment(build_html());
  const container = frag.firstElementChild;
  post_process.call(this, ctx, container, params);
  return container;
}

/**
 * Bind the review header without replacing the shared name/actions/summary.
 * Description writes use the same persistence path as the dashboard.
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @returns {HTMLElement}
 */
export function post_process(ctx, container, params = {}) {
  const preview = container.querySelector('.sc-context-builder-description-preview');
  const editor = container.querySelector('.sc-context-builder-description-editor');
  const input = container.querySelector('.sc-context-builder-description-input');
  const controls = container.querySelector('.sc-context-builder-description-actions');
  const cancel = controls.querySelector('button');
  const save = controls.querySelector('.mod-cta');
  let disposed = false;
  let saving = false;
  const is_disposed = () => disposed || ctx.deleted || params.is_disposed?.();

  const refresh = () => {
    const description = get_context_description_input_value(ctx);
    preview.textContent = description || 'Add description';
    preview.title = description || 'Add context description';
    if (editor.hidden) input.value = description;
  };
  const finish_edit = () => {
    editor.hidden = true;
    preview.hidden = false;
    preview.setAttribute('aria-expanded', 'false');
    refresh();
    preview.focus();
  };
  const save_description = async () => {
    if (saving || is_disposed()) return;
    saving = true;
    input.disabled = cancel.disabled = save.disabled = true;
    editor.setAttribute('aria-busy', 'true');
    try {
      await persist_context_description(ctx, {
        input_value: input.value,
        event_source: 'context_builder_view.description',
      });
      if (!is_disposed()) finish_edit();
    } catch (error) {
      ctx.env.events.emit('notification:error', {
        level: 'error', message: 'Context description could not be saved.',
        details: error.message, event_source: 'context_builder_view.description',
      });
    } finally {
      saving = false;
      input.disabled = cancel.disabled = save.disabled = false;
      editor.removeAttribute('aria-busy');
      if (!is_disposed() && !editor.hidden) input.focus();
    }
  };
  preview.addEventListener('click', () => {
    if (is_disposed()) return;
    input.value = get_context_description_input_value(ctx);
    editor.hidden = false;
    preview.hidden = true;
    preview.setAttribute('aria-expanded', 'true');
    input.focus();
  });
  cancel.addEventListener('click', () => {
    if (!saving && !is_disposed()) finish_edit();
  });
  save.addEventListener('click', save_description);
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.isComposing || saving || is_disposed()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      finish_edit();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save_description();
    }
  });
  refresh();
  this.attach_disposer(container, [
    ctx.on_event('context:updated', refresh),
    () => { disposed = true; },
  ]);
  return container;
}
