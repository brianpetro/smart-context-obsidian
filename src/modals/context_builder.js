import { SmartFuzzySuggestModal } from 'obsidian-smart-env/src/modals/smart_fuzzy_suggest_modal.js';
import {
  dispose_unmounted_builder,
} from '../components/smart-context/builder.js';

const suggest_menu_key = 'smart_context:suggest';

/**
 * Canonical Smart Context Builder.
 *
 * The established context_selector event and modal keys remain the transport
 * API so existing commands, integrations, and hotkeys open this Builder.
 */
export class ContextBuilderModal extends SmartFuzzySuggestModal {
  static get modal_type() { return 'context_selector'; }
  static get display_text() { return 'Context Builder'; }
  static get event_domain() { return 'context_selector'; }
  static get command_id() { return 'context_selector'; }
  static get modal_key() { return 'context_selector'; }
  get modal_key() { return 'context_selector'; }

  /**
   * @param {import('smart-contexts').SmartContext} smart_context
   * @param {any} [params={}]
   */
  constructor(smart_context, params = {}) {
    super(smart_context);

    this.params = { ...params };
    this.smart_context = smart_context;
    this.suggestions = null;
    this._request_id = 0;
    this._render_id = 0;
    this._source_mode_loading = false;
    this._is_closed = false;
    this._builder_container = null;
    this._builder_chrome_refresh = null;

    this.origin = resolve_context_builder_origin(smart_context, params.origin);
    this.source_modes = this.resolve_source_modes();
    this.active_source_mode = this.resolve_default_source_mode(
      String(params.source_mode || ''),
    );
    this.set_default_instructions();
    this.apply_active_source_mode_copy();
  }

  set_default_instructions() {
    this.setInstructions([
      { command: 'Enter', purpose: 'Add to context' },
      { command: '→ / ←', purpose: 'Browse source details' },
      { command: 'Esc', purpose: 'Close' },
    ]);
  }

  open(params = {}) {
    this.params = { ...this.params, ...params };
    super.open();
    void this.render(this.params);
  }

  /**
   * @param {any} [params=this.params]
   * @returns {Promise<void>}
   */
  async render(params = this.params) {
    if (this._is_closed) return;
    const render_id = ++this._render_id;

    this.modalEl.classList.add('sc-context-builder-modal');
    this.modalEl.style.display = 'flex';
    this.modalEl.style.flexDirection = 'column';
    this.modalEl.querySelector('.sc-context-builder-error')?.remove();

    const previous_builder = this._builder_container;
    this._builder_container = null;
    this._builder_chrome_refresh = null;
    dispose_unmounted_builder(previous_builder);

    try {
      if (!this.source_modes.length) {
        throw new Error('No Context Builder suggest actions are registered.');
      }

      const builder = await this.env.smart_components.render_component(
        'smart_context_builder',
        this.smart_context,
        {
          ...params,
          surface: 'context_builder',
          modal: this,
          origin: this.origin,
        },
      );
      if (!builder) throw new Error('Context Builder component returned no element.');
      if (this._is_closed || render_id !== this._render_id) {
        dispose_unmounted_builder(builder);
        return;
      }

      this._builder_container = builder;
      this.modalEl.prepend(builder);

      if (this.suggestions === null && !this._source_mode_loading && this.active_source_mode) {
        void this.update_suggestions(this.active_source_mode);
      }
    } catch (error) {
      if (!this._is_closed && render_id === this._render_id) {
        this.show_render_error(error);
      }
    }
  }

  /**
   * Keep render failures on the canonical Builder surface so there is no
   * hidden fallback to the retired Builder.
   *
   * @param {unknown} error
   * @returns {void}
   */
  show_render_error(error) {
    if (this._is_closed) return;

    this._render_id += 1;
    this._request_id += 1;
    this._source_mode_loading = false;
    dispose_unmounted_builder(this._builder_container);
    this._builder_container = null;
    this._builder_chrome_refresh = null;

    this.modalEl.querySelector('.sc-context-builder-error')?.remove();

    const error_el = document.createElement('div');
    error_el.className = 'sc-context-builder-error';

    const title_el = document.createElement('div');
    title_el.className = 'sc-context-builder-error-title';
    title_el.textContent = 'Context Builder could not render';
    error_el.appendChild(title_el);

    const message_el = document.createElement('div');
    message_el.className = 'sc-context-builder-error-message';
    message_el.textContent = get_error_message(
      error,
      'Close and reopen the Builder, or retry now.',
    );
    error_el.appendChild(message_el);

    const retry_button = document.createElement('button');
    retry_button.type = 'button';
    retry_button.textContent = 'Retry';
    retry_button.addEventListener('click', () => {
      error_el.remove();
      void this.render(this.params);
    });
    error_el.appendChild(retry_button);

    this.modalEl.prepend(error_el);
    console.error('Context Builder: Failed to render', error);
    this.env.events.emit('notification:error', {
      level: 'error',
      message: 'Context Builder could not render.',
      details: get_error_message(error, ''),
      event_source: 'context_builder.render',
    });
  }

  /**
   * Resolve explicitly placed context suggest actions.
   *
   * @param {object} [params={}]
   * @returns {Array<object>}
   */
  get_suggest_actions(params = {}) {
    if (typeof this.env?.resolve_menu_actions !== 'function') return [];

    try {
      let actions = this.env.resolve_menu_actions(
        suggest_menu_key,
        this.smart_context,
        {
          modal: this,
          ...params,
        },
      );

      const requested_action_keys = this.params?.default_suggest_action_keys;
      const configured_action_keys = this.env?.config?.modals?.[this.modal_key]
        ?.default_suggest_action_keys
      ;
      if (
        Array.isArray(requested_action_keys)
        && requested_action_keys !== configured_action_keys
      ) {
        actions = actions.filter((action) => {
          return requested_action_keys.includes(action.action_key);
        });
      }

      return actions.filter((action) => {
        return action.disabled !== true && action.menu_only !== true;
      });
    } catch (error) {
      console.error('Context Builder: Failed to resolve suggest actions', error);
      return [];
    }
  }

  /**
   * Resolve placed context suggest actions for Builder tabs.
   *
   * @returns {Array<any>}
   */
  resolve_source_modes() {
    return this.get_suggest_actions({
      surface: 'context_builder',
    }).map((action) => normalize_source_mode(this.env, action));
  }

  /**
   * @param {string} [preferred_action_key='']
   * @returns {string}
   */
  resolve_default_source_mode(preferred_action_key = '') {
    return this.get_source_mode(preferred_action_key)?.action_key
      || this.get_source_mode('context_suggest_sources')?.action_key
      || this.source_modes[0]?.action_key
      || ''
    ;
  }

  /**
   * @param {string} action_key
   * @returns {any|null}
   */
  get_source_mode(action_key = '') {
    return this.source_modes.find((mode) => mode.action_key === action_key) || null;
  }

  /**
   * @returns {Array<object>}
   */
  get_suggestions() {
    if (this._is_closed) return [];
    if (Array.isArray(this.suggestions)) {
      return this.filter_suggestions(this.suggestions);
    }
    if (!this._source_mode_loading && this.active_source_mode) {
      void this.update_suggestions(this.active_source_mode);
    }
    return [];
  }

  /**
   * An empty array is a valid source-mode result.
   *
   * @param {string|Function|Array<object>|object} suggest_ref
   * @returns {Promise<Array<object>|void>}
   */
  async update_suggestions(suggest_ref) {
    if (this._is_closed) return [];
    const request_id = ++this._request_id;
    const source_mode = resolve_source_mode_ref(this, suggest_ref);
    const action_key = source_mode?.action_key
      || (typeof suggest_ref === 'string' ? suggest_ref : '')
    ;
    this._source_mode_loading = true;
    this.suggestions = null;
    this._set_custom_instructions = false;

    try {
      let result;
      if (source_mode) {
        result = await source_mode.run({
          modal: this,
          event_source: `context_builder.suggest:${source_mode.action_key}`,
        });
      } else if (typeof suggest_ref === 'function') {
        result = await suggest_ref({ modal: this });
      } else {
        result = suggest_ref;
      }

      if (!this.is_request_current(request_id)) return [];
      if (!Array.isArray(result)) {
        throw new Error(`Suggestion action did not return an array: ${action_key || 'unknown'}`);
      }

      this.suggestions = result;
      if (!this._set_custom_instructions) this.set_default_instructions();
      this.update_suggestions_view();
      this.refresh_builder_chrome();
      return result;
    } catch (error) {
      if (!this.is_request_current(request_id)) return [];

      console.error('Context Builder: Failed to update suggestions', {
        action_key,
        error,
      });
      this.suggestions = [];
      this.set_default_instructions();
      this.update_suggestions_view();
      this.env.events.emit('notification:error', {
        level: 'error',
        message: get_error_message(error, 'Failed to load context suggestions.'),
        event_source: 'context_builder.update_suggestions',
      });
      this.refresh_builder_chrome();
      return [];
    } finally {
      if (this.is_request_current(request_id)) this._source_mode_loading = false;
    }
  }

  /**
   * Prevent a late nested folder, block, or connection result from replacing a
   * newer source-mode or nested action result.
   *
   * @param {any} suggestion
   * @param {string} action_key
   * @returns {Promise<unknown>}
   */
  async handle_choose_action(suggestion, action_key) {
    if (this._is_closed) return false;
    const chosen_action = suggestion?.[action_key];
    if (typeof chosen_action !== 'function') return false;

    const request_id = ++this._request_id;
    const selected_index = this.chooser?.values?.findIndex((item) => {
      return item?.item?.display === suggestion.display;
    }) ?? -1;

    try {
      const result = await chosen_action({ modal: this });
      if (!this.is_request_current(request_id)) return result;

      if (Array.isArray(result)) {
        this.suggestions = result;
        if (!result.length) {
          this.env.events.emit('notification:info', {
            message: 'No suggestions returned from action',
          });
        }
      }

      setTimeout(() => {
        if (!this.is_request_current(request_id)) return;
        this.update_suggestions_view();
        if (selected_index !== -1) this.chooser?.setSelectedItem(selected_index);
      }, 100);
      return result;
    } catch (error) {
      if (!this.is_request_current(request_id)) return false;

      console.error('Context Builder: Failed to run suggestion action', {
        action_key,
        error,
      });
      this.env.events.emit('notification:error', {
        level: 'error',
        message: get_error_message(error, 'Failed to update context suggestions.'),
        event_source: 'context_builder.handle_choose_action',
      });
      this.update_suggestions_view();
      return false;
    }
  }

  /**
   * @param {string} action_key
   * @returns {Promise<Array<object>|void>|null}
   */
  set_active_source_mode(action_key) {
    if (this._is_closed) return null;
    const source_mode = this.get_source_mode(action_key);
    if (!source_mode) return null;

    this.active_source_mode = action_key;
    this.suggestions = null;
    this.last_input_value = null;
    this.inputEl.value = '';
    this.apply_active_source_mode_copy();
    this.refresh_builder_chrome();
    setTimeout(() => {
      if (!this._is_closed) this.focus_search();
    }, 0);
    return this.update_suggestions(source_mode);
  }

  /**
   * @returns {any|null}
   */
  get active_source_mode_meta() {
    return this.get_source_mode(this.active_source_mode);
  }

  /**
   * @returns {boolean}
   */
  get has_undoable_origin_seed() {
    return this.prune_origin_seed_state().length > 0;
  }

  /**
   * @returns {string[]}
   */
  prune_origin_seed_state() {
    const context_items = this.smart_context.data?.context_items || {};
    const seeded_keys = unique_strings(this.origin.seeded_keys)
      .filter((key) => Object.prototype.hasOwnProperty.call(context_items, key))
    ;

    if (seeded_keys.length !== this.origin.seeded_keys.length) {
      this.origin = {
        ...this.origin,
        seeded_keys,
      };
    }
    return seeded_keys;
  }

  /**
   * @returns {string[]}
   */
  undo_origin_seed() {
    const seeded_keys = this.prune_origin_seed_state();
    if (!seeded_keys.length) return [];

    const removed_keys = this.smart_context.remove_items(seeded_keys) || [];
    this.origin = {
      ...this.origin,
      selection_count: 0,
      seeded_keys: [],
    };
    this.refresh_builder_chrome();
    return removed_keys;
  }

  focus_search() {
    this.inputEl.focus();
  }

  /**
   * @param {Function|null} callback
   * @returns {void}
   */
  set_builder_chrome_refresh(callback) {
    this._builder_chrome_refresh = callback;
  }

  /**
   * Clear a Builder callback only when it still belongs to the disposing
   * component. This prevents a late detached-DOM disposer from clearing a
   * newer Builder render's callback.
   *
   * @param {Function} callback
   * @returns {void}
   */
  clear_builder_chrome_refresh(callback) {
    if (this._builder_chrome_refresh !== callback) return;
    this._builder_chrome_refresh = null;
  }

  refresh_builder_chrome() {
    if (this._is_closed) return;
    this._builder_chrome_refresh?.();
  }

  /**
   * @param {number} request_id
   * @returns {boolean}
   */
  is_request_current(request_id) {
    return !this._is_closed && request_id === this._request_id;
  }

  update_suggestions_view() {
    if (this._is_closed) return;
    try {
      this.updateSuggestions();
    } catch (error) {
      console.warn('Context Builder: Failed to refresh suggestion view', error);
    }
  }

  apply_active_source_mode_copy() {
    const mode = this.active_source_mode_meta;
    if (!mode) return;
    this.emptyStateText = mode.empty_text;
    this.setPlaceholder(mode.placeholder);
  }

  filter_suggestions(suggestions) {
    return suggestions.filter((suggestion) => {
      if (
        suggestion.key
        && this.smart_context?.data?.context_items?.[suggestion.key]
      ) {
        return false;
      }
      return true;
    });
  }

  onClose() {
    this._is_closed = true;
    this._request_id += 1;
    this._render_id += 1;
    this._source_mode_loading = false;
    this._builder_chrome_refresh = null;
    dispose_unmounted_builder(this._builder_container);
    this._builder_container = null;
    super.onClose();
  }
}

/**
 * @param {any} env
 * @param {any} action
 * @returns {any}
 */
function normalize_source_mode(env, action) {
  const label = String(action?.title || humanize(action?.action_key || '')).trim();
  const search_label = label.toLowerCase();
  const action_entry = env?.config?.actions?.[action.action_key] || {};

  return {
    ...action,
    label,
    icon: action.icon || 'plus',
    description: action_entry.display_description || '',
    placeholder: `Search ${search_label}...`,
    empty_text: `No matching ${search_label} found`,
  };
}

/**
 * @param {ContextBuilderModal} modal
 * @param {unknown} suggest_ref
 * @returns {any|null}
 */
function resolve_source_mode_ref(modal, suggest_ref) {
  if (typeof suggest_ref === 'string') {
    return modal.get_source_mode(suggest_ref);
  }
  if (
    suggest_ref
    && typeof suggest_ref === 'object'
    && typeof suggest_ref.action_key === 'string'
    && typeof suggest_ref.run === 'function'
  ) {
    return suggest_ref;
  }
  return null;
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {unknown} origin
 * @returns {object}
 */
function resolve_context_builder_origin(ctx, origin) {
  if (origin && typeof origin === 'object') {
    return normalize_origin(origin);
  }

  const context_key = String(ctx?.key || '');
  if (context_key.endsWith('#codeblock')) {
    return normalize_origin({
      kind: 'codeblock',
      source_path: context_key.slice(0, -'#codeblock'.length),
    });
  }

  if (
    Object.keys(ctx?.data?.context_items || {}).length
    || Object.keys(ctx?.data?.exclusions || {}).length
    || String(ctx?.data?.name || '').trim()
  ) {
    return normalize_origin({ kind: 'preselected' });
  }

  return normalize_origin({ kind: 'empty' });
}

/**
 * @param {object} origin
 * @returns {object}
 */
function normalize_origin(origin = {}) {
  const seeded_keys = unique_strings(origin.seeded_keys);
  return {
    kind: String(origin.kind || 'preselected'),
    source_path: String(origin.source_path || ''),
    selection_count: Number.isFinite(origin.selection_count)
      ? Math.max(0, origin.selection_count)
      : seeded_keys.length,
    seeded_keys,
  };
}

/**
 * @param {unknown} values
 * @returns {string[]}
 */
function unique_strings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map((value) => String(value || '').trim())
    .filter(Boolean))]
  ;
}

/**
 * @param {string} value
 * @returns {string}
 */
function humanize(value = '') {
  return String(value)
    .replace(/^context_suggest_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
  ;
}

/**
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
function get_error_message(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default ContextBuilderModal;
