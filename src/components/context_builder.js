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

  container.addEventListener('smart-env:context-updated', async (e) => {
    const new_tree = await env.render_component('context_tree', ctx, {
      ...opts,
    });
    this.empty(body);
    body.appendChild(new_tree);
    const new_stats = await env.render_component('context_stats', ctx, opts);
    this.empty(footer);
    footer.appendChild(new_stats);
  });

  /* ─────────────────────────── Initial render ────────────────────────── */
  const tree_container = await env.render_component('context_tree', ctx, {
    ...opts,
  });
  this.empty(body);
  body.appendChild(tree_container);

  const stats_container = await env.render_component('context_stats', ctx, opts);
  this.empty(footer);
  footer.appendChild(stats_container);
}