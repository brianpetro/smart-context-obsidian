function estimate_tokens(char_count){
  return Math.ceil(char_count / 4);
}

export function build_html(ctx) {
  return `<div>
    <div class="sc-stats" aria-live="polite"></div>
  </div>`;
}

export async function render(ctx, opts = {}) {
  const html = build_html(ctx);
  const frag = this.create_doc_fragment(html);
  const container = frag.querySelector('.sc-stats');
  post_process.call(this, ctx, container, opts);
  return container;
}

export async function post_process(ctx, container, opts = {}) {
  const items = ctx.get_context_items();
  if(!items.length){
    // container.textContent = 'Add context';
    return;
  }
  const { stats } = await ctx.compile({ link_depth: 0, calculating: true });
  const total_chars = stats.char_count;
  const total_tokens = estimate_tokens(total_chars);
  container.textContent = `≈ ${total_chars.toLocaleString()} chars · ${total_tokens.toLocaleString()} tokens`;
  return container;
}
