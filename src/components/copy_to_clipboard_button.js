import { show_stats_notice } from '../utils/show_stats_notice.js';
import { copy_to_clipboard } from '../utils/copy_to_clipboard.js';

export function build_html() {
  return '<button class="sc-copy-clipboard" type="button">Copy to clipboard</button>';
}

export async function render(ctx) {
  const html = build_html();
  const frag = this.create_doc_fragment(html);
  const btn = frag.querySelector('button');
  btn.addEventListener('click', async () => {
    const { context, stats, images } = await ctx.compile({ link_depth: 0 });
    await copy_to_clipboard(context, images);
    show_stats_notice(stats, `${Object.keys(ctx.data.context_items).length} file(s)`);
  });
  return frag;
}