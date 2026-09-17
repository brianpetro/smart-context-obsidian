import { Platform } from 'obsidian';
import { SmartContext } from 'obsidian-smart-env/src/items/smart_context.js';
import { ContextBuilderView } from '../views/context_builder_view.js';
import { context_open_builder_view } from '../actions/context/open_builder_view.js';
import { build_html, render as render_builder } from '../components/smart-context/builder.js';
import { render as render_header } from '../components/smart-context/builder_view_header.js';
import { render as render_tree } from '../components/smart-context/builder_tree.js';

/** Explicit DOM/lifecycle stand-ins, not a browser or Obsidian acceptance fixture. */
export function create_element(tag = 'div', doc = globalThis.document) {
  const element = {
    tagName: tag, ownerDocument: doc, className: '', dataset: {}, attributes: {},
    children: [], parentElement: null, listeners: new Map(), disposers: [],
    value: '', textContent: '', scrollTop: 0, hidden: false,
    style: { removeProperty() {} },
    get isConnected() { return this.connected_root || Boolean(this.parentElement?.isConnected); },
    appendChild(child) {
      if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((node) => node !== child);
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    append(child) { if (typeof child === 'string') this.textContent += child; else this.appendChild(child); },
    replaceChildren(...children) { [...this.children].forEach((child) => child.remove()); children.forEach((child) => this.appendChild(child)); },
    replaceWith(child) {
      const parent = this.parentElement;
      const index = parent.children.indexOf(this);
      this.remove();
      child.parentElement = parent;
      parent.children.splice(index, 0, child);
    },
    empty() { this.replaceChildren(); },
    remove() {
      this.children.forEach((child) => child.dispose());
      this.dispose();
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    },
    dispose() { this.disposers.splice(0).forEach((dispose) => dispose()); this.children.forEach((child) => child.dispose()); },
    createEl(tag, params = {}) { const child = create_element(tag, doc); child.textContent = params.text || ''; child.className = params.cls || ''; return this.appendChild(child); },
    createDiv(params) { return this.createEl('div', params); },
    setAttribute(key, value) { this.attributes[key] = String(value); },
    getAttribute(key) { return this.attributes[key]; },
    removeAttribute(key) { delete this.attributes[key]; },
    addEventListener(key, callback) { if (!this.listeners.has(key)) this.listeners.set(key, new Set()); this.listeners.get(key).add(callback); },
    removeEventListener(key, callback) { this.listeners.get(key)?.delete(callback); },
    async dispatch(type, event = {}) {
      const payload = { target: this, preventDefault() {}, stopPropagation() {}, ...event };
      for (const callback of this.listeners.get(type) || []) await callback(payload);
      return payload;
    },
    matches(selector) {
      return selector.split(',').some((part) => {
        const [main, attr] = part.trim().split('[');
        const [tag, ...classes] = main.split('.');
        if (tag && tag !== this.tagName) return false;
        if (classes.some((name) => !this.classList.contains(name))) return false;
        if (!attr) return true;
        const [key, value] = attr.slice(0, -1).split('=');
        const actual = key.startsWith('data-')
          ? this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]
          : this.attributes[key];
        return actual !== undefined && (!value || actual === value.replaceAll('"', ''));
      });
    },
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); },
    contains(child) { return child === this || this.children.some((node) => node.contains(child)); },
    querySelectorAll(selector) { return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    focus() { doc.activeElement = this; },
    blur() { doc.activeElement = null; },
    scrollIntoView() {},
  };
  element.classList = {
    toggle(name, force) { const active = force ?? !this.contains(name); if (active) this.add(name); else this.remove(name); return active; },
    contains: (name) => element.className.split(' ').includes(name),
    add: (...names) => { element.className = [...new Set([...element.className.split(' '), ...names])].join(' '); },
    remove: (name) => { element.className = element.className.split(' ').filter((item) => item !== name).join(' '); },
  };
  return element;
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

export function create_builder_fixture(t, options = {}) {
  const saved = ['document', 'activeDocument', 'requestAnimationFrame', 'cancelAnimationFrame']
    .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const is_mobile = Platform.isMobile;
  Platform.isMobile = Boolean(options.mobile);
  const doc = { activeElement: null };
  doc.defaultView = create_element('window', doc);
  doc.createElement = (tag) => create_element(tag, doc);
  doc.body = create_element('body', doc);
  doc.body.connected_root = true;
  globalThis.document = globalThis.activeDocument = doc;
  const frames = new Map();
  let frame_id = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++frame_id, callback); return frame_id; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const listeners = new Map();
  const events = {
    on(key, callback) { if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(callback); return () => listeners.get(key).delete(callback); },
    emit(key, payload) { for (const callback of [...(listeners.get(key) || [])]) callback(payload); },
  };
  const calls = [], renders = [], notifications = [], leaves = [], contexts = new Map();
  const workspace = {
    recent: null,
    getLeavesOfType(type) { return leaves.filter((leaf) => leaf.view?.getViewType?.() === type && !leaf.view.closed); },
    getRightLeaf() { calls.push('right'); return create_leaf('right'); },
    getLeaf() { calls.push('tab'); return create_leaf('root'); },
    getMostRecentLeaf() { return this.recent; },
    setActiveLeaf(leaf, params) { calls.push(['active', leaf, params]); if (leaf.area === 'root') this.recent = leaf; },
    async revealLeaf(leaf) { calls.push(['reveal', leaf]); this.setActiveLeaf(leaf, { focus: true }); },
    requestSaveLayout() { calls.push('save_layout'); },
    onLayoutReady(callback) { callback(); },
    registerHoverLinkSource() { calls.push('register_hover'); },
    unregisterHoverLinkSource() { calls.push('unregister_hover'); },
    rightSplit: { expand() { calls.push('expand'); } },
  };
  const env = {
    state: 'loaded', events, is_pro: Boolean(options.is_pro),
    config: { components: { smart_context_rules_list: {} } },
    obsidian_app: { workspace },
    smart_contexts: {
      get: (key) => contexts.get(key),
      get_named_context: (name) => [...contexts.values()].find((ctx) => ctx.name === name),
      open_builder(ctx, params) { calls.push(['suggestions', ctx, params]); return true; },
    },
    resolve_menu_actions() {
      return [
        { action_key: 'context_suggest_sources', title: 'Notes', icon: 'file' },
        { action_key: 'context_suggest_folders', title: 'Folders', icon: 'folder' },
        { action_key: 'hidden', title: 'Hidden', disabled: true },
        { action_key: 'menu', title: 'Menu only', menu_only: true },
      ];
    },
  };
  const plugin = { app: env.obsidian_app, env };
  env.plugin = plugin;
  events.on('notification:error', (payload) => notifications.push(payload));
  const smart_view = {
    apply_style_sheet() {},
    create_doc_fragment(html) {
      const frag = create_element('fragment', doc);
      let parent = frag;
      for (const [token] of html.matchAll(/<[^>]+>|[^<]+/g)) {
        if (!token.startsWith('<')) {
          parent.textContent += token;
          continue;
        }
        if (token.startsWith('</')) { parent = parent.parentElement; continue; }
        const [, tag, attributes] = token.match(/<([\w-]+)([^>]*)>/);
        const child = create_element(tag, doc);
        for (const [, key, value = ''] of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
          child.setAttribute(key, value);
          if (key === 'class') child.className = value;
          else if (key === 'hidden') child.hidden = true;
          else if (key === 'rows') child.rows = Number(value);
          else if (['type', 'title', 'placeholder'].includes(key)) child[key] = value;
        }
        parent.appendChild(child);
        if (!['input', 'br', 'hr', 'img'].includes(tag)) parent = child;
      }
      return { firstElementChild: frag.children[0] };
    },
    attach_disposer(element, disposers) { element.disposers.push(...(Array.isArray(disposers) ? disposers : [disposers])); },
  };
  env.smart_components = {
    async render_component(key, ctx, params) {
      renders.push({ key, ctx, params });
      if (key === 'smart_context_builder') return render_builder.call(smart_view, ctx, params);
      if (key === 'smart_context_builder_view_header') return render_header.call(smart_view, ctx, params);
      if (key === 'smart_context_builder_tree') return render_tree.call(smart_view, ctx, params);
      const element = create_element('div', doc);
      params.on_ready?.(() => {});
      if (key === 'smart_context_builder_summary') params.on_summary({ source_count: ctx.item_count });
      return element;
    },
  };
  function create_leaf(area) {
    const container_el = doc.body.createDiv();
    container_el.createDiv(); container_el.createDiv();
    const leaf = {
      area, containerEl: container_el, view: null,
      async setViewState(state) {
        calls.push(['state', state]);
        if (!this.view) {
          this.view = new ContextBuilderView(this, plugin);
          // Skip the unrelated mobile status-bar DOM in this controlled fixture.
          this.view.render_mobile_status_bar = async () => {};
          await this.view.onOpen();
        }
        await this.view.setState(state.state, {});
      },
      async loadIfDeferred() { calls.push('deferred_load'); },
    };
    leaves.push(leaf);
    return leaf;
  }
  function create_context(key = 'temporary', data = {}) {
    const ctx = {
      key, env, collection: env.smart_contexts,
      data: { key, name: '', context_items: { 'a.md': { key: 'a.md' } }, ...data },
      get name() { return this.data.name; },
      get item_count() { return Object.keys(this.data.context_items).length; },
      get excluded_item_count() { return Object.keys(this.data.exclusions || {}).length; },
      queue_save() { calls.push(['save_context', this]); },
      emit_event(key, payload = {}) { events.emit(key, { item_key: this.key, ...payload }); },
      on_event(key, callback) { return events.on(key, (payload) => { if (payload.item_key === this.key) callback(payload); }); },
      remove_by_paths: SmartContext.prototype.remove_by_paths,
      actions: {},
    };
    ctx.context_items = { filter(filter) {
      const items = Object.entries(ctx.data.context_items).map(([key, data]) => ({
        key, data, exists: true, env,
        async open(event) { calls.push(['source', key, event]); },
      }));
      return filter ? items.filter(filter) : items;
    } };
    ctx.actions.context_open_builder_view = (params) => context_open_builder_view.call(ctx, params);
    contexts.set(key, ctx);
    return ctx;
  }
  const ctx = create_context(options.key, options.data);
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const frame = async () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((fn) => fn()); await settle(); };
  t.teardown(async () => {
    for (const leaf of leaves) if (leaf.view && !leaf.view.closed) await leaf.view.onClose();
    doc.body.dispose();
    await settle();
    frames.clear();
    Platform.isMobile = is_mobile;
    saved.forEach(([key, descriptor]) => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
  });
  return { ctx, env, plugin, workspace, contexts, leaves, doc, smart_view, calls, renders, notifications,
    listeners, frame, settle, create_context,
    builder_element: (params = {}) => smart_view.create_doc_fragment(build_html(ctx, params)).firstElementChild,
  };
}
