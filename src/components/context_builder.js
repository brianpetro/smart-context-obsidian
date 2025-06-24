import context_builder_css from './context_builder.css' with { type: 'css' };

/**
 * build_html
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {Object} opts
 * @returns {string}
 */
export function build_html(ctx, opts = {}) {
  return `<div>
    <div class="sc-context-builder" data-context-key="${ctx.data.key}">
      <div class="sc-context-header">
        <div class="sc-context-actions"></div>
      </div>
      <div class="sc-context-body">
      </div>
      <div class="sc-context-footer">
        <div class="sc-context-stats"></div>
      </div>
    </div>
  </div>`;
}

export async function render(ctx, opts = {}) {
  const html = build_html.call(this, ctx, opts);
  const frag = this.create_doc_fragment(html);
  const ctx_container = frag.querySelector('.sc-context-builder');
  this.apply_style_sheet(context_builder_css);
  await post_process.call(this, ctx, ctx_container, opts);
  return ctx_container;
}

export async function post_process(ctx, container, opts = {}) {
  const env = ctx.env;
  const body = container.querySelector('.sc-context-body');
  const footer = container.querySelector('.sc-context-footer');

  const opts_update_callback = opts.update_callback || (() => {});
  /**
   * Re‑renders both the tree and the stats components whenever the context
   * changes (e.g. an item is removed or added).
   * Propagates the change back up via opts.update_callback, if provided.
   *
   * @param {import('smart-contexts').SmartContext} _ctx
   */
  const update_callback = async (_ctx) => {
    // ── Tree ────────────────────────────────────────────────────────────
    const new_tree = await env.render_component('context_tree', _ctx, {
      ...opts,
      update_callback,
    });
    this.empty(body);
    body.appendChild(new_tree);

    // ── Stats ───────────────────────────────────────────────────────────
    const new_stats = await env.render_component('context_stats', _ctx, opts);
    this.empty(footer);
    footer.appendChild(new_stats);

    // Bubble the change upward so parent components (e.g. chat builders)
    // can react to the updated context.
    // opts.update_callback?.(_ctx);
    opts_update_callback(_ctx);
  };
  opts.update_callback = update_callback; //  ensure we use the same callback in extended post_process

  /* ─────────────────────────── Initial render ────────────────────────── */
  const tree_container = await env.render_component('context_tree', ctx, {
    ...opts,
    update_callback,
  });
  this.empty(body);
  body.appendChild(tree_container);

  const stats_container = await env.render_component('context_stats', ctx, opts);
  this.empty(footer);
  footer.appendChild(stats_container);
}
