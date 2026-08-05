import { Menu, setIcon } from 'obsidian';
import {
  render_btn_clear_context,
  render_btn_help,
} from 'obsidian-smart-env/src/utils/smart-context/copy_actions.js';

export const version = '3.1.3';

export function build_html() {
  return '<div class="sc-context-builder-ui-primary-control"></div>';
}

/**
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {any} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function render(ctx, params = {}) {
  const frag = this.create_doc_fragment(build_html());
  const container = frag.firstElementChild;
  post_process.call(this, ctx, container, params);
  return container;
}

/**
 * @this {any}
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLElement} container
 * @param {any} params
 * @returns {HTMLElement}
 */
export function post_process(ctx, container, params = {}) {
  const render_control = () => {
    const menu_params = get_menu_params(params);
    const source_count = params.get_source_count
      ? params.get_source_count()
      : params.source_count
    ;
    const state = resolve_primary_control(ctx, {
      source_count,
      menu_params,
      copy_menu_key: params.copy_menu_key,
    });

    container.replaceChildren();
    container.dataset.intent = state.intent;
    container.dataset.mode = state.mode;

    const primary_group = document.createElement('div');
    primary_group.className = 'sc-context-builder-ui-primary-group';
    container.appendChild(primary_group);

    if (state.intent === 'add_sources') {
      const button = create_button('Add sources', 'plus', 'mod-cta sc-context-builder-ui-primary-main');
      button.addEventListener('click', () => params.on_add_sources?.());
      primary_group.appendChild(button);
    } else if (state.primary_action) {
      const button = create_button('Copy context', 'copy', 'mod-cta sc-context-builder-ui-primary-main');
      button.addEventListener('click', () => {
        void run_primary_action(ctx, button, state.primary_action, params);
      });
      primary_group.appendChild(button);

      if (state.mode === 'split') {
        const menu_button = create_icon_button(
          'chevron-down',
          'Open copy options',
          'mod-cta sc-context-builder-ui-primary-chevron',
        );
        menu_button.addEventListener('click', (event) => {
          open_copy_menu(ctx, event, params, menu_params);
        });
        primary_group.appendChild(menu_button);
      }
    } else if (state.mode === 'menu') {
      const button = create_button('Copy options', 'copy', 'mod-cta sc-context-builder-ui-primary-main');
      button.addEventListener('click', (event) => {
        open_copy_menu(ctx, event, params, menu_params);
      });
      primary_group.appendChild(button);
    } else {
      const button = create_button('Copy unavailable', 'copy', 'sc-context-builder-ui-primary-main');
      button.disabled = true;
      primary_group.appendChild(button);
    }

    const overflow_groups = resolve_overflow_groups(ctx, params, menu_params);
    if (overflow_groups.length) {
      const overflow_button = create_icon_button(
        'ellipsis',
        'More context actions',
        'clickable-icon sc-context-builder-ui-overflow',
      );
      overflow_button.addEventListener('click', (event) => {
        open_overflow_menu(
          ctx,
          event,
          overflow_groups,
          params,
          menu_params,
        );
      });
      container.appendChild(overflow_button);
    }

    const clear_button = render_btn_clear_context(ctx, container);
    clear_button?.classList.add('sc-context-builder-ui-secondary-action');
    const help_button = render_btn_help(ctx, container);
    help_button?.classList.add('sc-context-builder-ui-secondary-action');
  };

  params.on_ready?.(render_control);
  render_control();
  this.attach_disposer(container, [
    ctx.on_event('context:updated', render_control),
    () => params.on_ready?.(null),
  ]);
  return container;
}

/**
 * Translate visible copy actions into one primary control state.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {any} [params={}]
 * @returns {any}
 */
export function resolve_primary_control(ctx, params = {}) {
  const source_count = Number.isFinite(params.source_count)
    ? params.source_count
    : Number(ctx?.item_count || 0)
  ;

  if (source_count <= 0) {
    return {
      intent: 'add_sources',
      label: 'Add sources',
      icon: 'plus',
      mode: 'direct',
      primary_action: null,
      copy_actions: [],
    };
  }

  const copy_actions = params.copy_actions || resolve_copy_actions(ctx, params);
  const primary_action = copy_actions.find((action) => {
    return action.disabled !== true
      && action.menu_only !== true
      && typeof action.run === 'function'
    ;
  }) || null;

  if (primary_action) {
    return {
      intent: 'copy_context',
      label: 'Copy context',
      icon: 'copy',
      mode: copy_actions.length > 1 ? 'split' : 'direct',
      primary_action,
      copy_actions,
    };
  }

  if (copy_actions.length) {
    return {
      intent: 'copy_options',
      label: 'Copy options',
      icon: 'copy',
      mode: 'menu',
      primary_action: null,
      copy_actions,
    };
  }

  return {
    intent: 'copy_unavailable',
    label: 'Copy unavailable',
    icon: 'copy',
    mode: 'none',
    primary_action: null,
    copy_actions: [],
  };
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {any} [params={}]
 * @returns {Array<object>}
 */
export function resolve_copy_actions(ctx, params = {}) {
  if (typeof ctx?.env?.resolve_menu_actions !== 'function') return [];

  try {
    const actions = ctx.env.resolve_menu_actions(
      params.copy_menu_key || 'smart_context:copy_menu',
      ctx,
      params.menu_params || {},
    );
    return Array.isArray(actions) ? actions : [];
  } catch (error) {
    console.error('Smart Context Builder: Failed to resolve copy actions', error);
    return [];
  }
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {HTMLButtonElement} button
 * @param {any} action
 * @param {any} params
 * @returns {Promise<void>}
 */
async function run_primary_action(ctx, button, action, params) {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    await action.run({
      event_source: params.event_source || 'context_builder.primary',
    });
  } catch (error) {
    emit_action_error(ctx, error, params.event_source || 'context_builder.primary');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {MouseEvent} event
 * @param {any} params
 * @param {any} menu_params
 * @returns {void}
 */
function open_copy_menu(ctx, event, params, menu_params) {
  const app = ctx?.env?.obsidian_app
    || ctx?.env?.plugin?.app
    || activeWindow?.app
  ;
  if (!app) return;

  const menu = new Menu(app);
  try {
    ctx.env.build_menu(
      params.copy_menu_key || 'smart_context:copy_menu',
      menu,
      ctx,
      menu_params,
    );
  } catch (error) {
    emit_action_error(
      ctx,
      error,
      params.event_source || 'context_builder.copy_menu',
    );
    return;
  }
  if (menu.items?.length) menu.showAtMouseEvent(event);
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {MouseEvent} event
 * @param {Array<any>} groups
 * @param {any} params
 * @param {any} menu_params
 * @returns {void}
 */
function open_overflow_menu(ctx, event, groups, params, menu_params) {
  const app = ctx?.env?.obsidian_app
    || ctx?.env?.plugin?.app
    || activeWindow?.app
  ;
  if (!app) return;

  const menu = new Menu(app);
  try {
    groups.forEach((group) => {
      if (menu.items?.length) menu.addSeparator();
      ctx.env.build_menu(group.menu_key, menu, group.scope, menu_params);
    });
  } catch (error) {
    emit_action_error(
      ctx,
      error,
      params.event_source || 'context_builder.overflow_menu',
    );
    return;
  }
  if (menu.items?.length) menu.showAtMouseEvent(event);
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {any} params
 * @param {any} menu_params
 * @returns {Array<any>}
 */
function resolve_overflow_groups(ctx, params, menu_params) {
  return (params.overflow_groups || [])
    .map((group) => {
      const scope = group.scope || ctx;
      try {
        const actions = ctx.env.resolve_menu_actions(
          group.menu_key,
          scope,
          menu_params,
        );
        if (!actions.length) return null;
        return {
          menu_key: group.menu_key,
          scope,
        };
      } catch (error) {
        console.error('Smart Context Builder: Failed to resolve overflow actions', error);
        return null;
      }
    })
    .filter(Boolean)
  ;
}

/**
 * @param {any} params
 * @returns {object}
 */
function get_menu_params(params) {
  return {
    ...(params.menu_params || {}),
    ...(params.get_menu_params?.() || {}),
  };
}

/**
 * @param {string} label
 * @param {string} icon
 * @param {string} class_name
 * @returns {HTMLButtonElement}
 */
function create_button(label, icon, class_name) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = class_name;
  button.setAttribute('aria-label', label);

  const icon_el = document.createElement('span');
  icon_el.className = 'sc-context-builder-ui-button-icon';
  setIcon(icon_el, icon);
  button.appendChild(icon_el);

  const label_el = document.createElement('span');
  label_el.className = 'sc-context-builder-ui-button-label';
  label_el.textContent = label;
  button.appendChild(label_el);
  return button;
}

/**
 * @param {string} icon
 * @param {string} label
 * @param {string} class_name
 * @returns {HTMLButtonElement}
 */
function create_icon_button(icon, label, class_name) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = class_name;
  button.setAttribute('aria-label', label);
  setIcon(button, icon);
  return button;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {unknown} error
 * @param {string} event_source
 * @returns {void}
 */
function emit_action_error(ctx, error, event_source) {
  console.error('Smart Context Builder: Context action failed', error);
  ctx.env.events.emit('notification:error', {
    level: 'error',
    message: error instanceof Error ? error.message : 'Context action failed.',
    event_source,
  });
}
