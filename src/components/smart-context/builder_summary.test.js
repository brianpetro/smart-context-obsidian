import test from 'ava';
import {
  format_byte_count,
  format_context_estimate,
  get_context_summary,
} from './builder_summary.js';

function build_context(params = {}) {
  const named_contexts = params.named_contexts || {};

  return {
    data: {
      context_items: params.context_items_data || {},
      exclusions: params.exclusions || {},
    },
    excluded_item_count: params.excluded_item_count,
    env: {
      smart_contexts: {
        get_named_context(name) {
          return named_contexts[name] || null;
        },
      },
      smart_sources: {
        sources_re_import_queue: params.re_import_queue || {},
      },
    },
  };
}

test('uses cached expanded group counts without rehydrating ContextItems', (t) => {
  const ctx = build_context({
    context_items_data: {
      Folder: { key: 'Folder', folder: true, group_items_ct: 8 },
      Shared: { key: 'Shared', named_context: true, group_items_ct: 3 },
      'direct.md': { key: 'direct.md', size: 500 },
    },
    named_contexts: {
      Shared: {},
    },
  });

  Object.defineProperty(ctx, 'context_items', {
    get() {
      throw new Error('summary must not hydrate context items');
    },
  });

  const summary = get_context_summary(ctx);

  t.is(summary.selection_count, 3);
  t.is(summary.source_count, 12);
  t.true(summary.source_count_known);
  t.is(summary.estimated_text_chars, 500);
  t.is(summary.estimated_tokens, 125);
});

test('keeps direct media bytes out of text character estimates', (t) => {
  const ctx = build_context({
    context_items_data: {
      'note.md': { key: 'note.md', size: 1200 },
      'image.png': { key: 'image.png', size: 2048 },
      'file.pdf': { key: 'file.pdf', size: 4096 },
    },
  });

  const summary = get_context_summary(ctx);

  t.is(summary.estimated_text_chars, 1200);
  t.is(summary.estimated_tokens, 300);
  t.is(summary.media_count, 2);
  t.is(summary.media_bytes, 6144);
});

test('counts missing sources, exclusions, and relevant pending updates', (t) => {
  const ctx = build_context({
    context_items_data: {
      'a.md': { key: 'a.md', size: 100 },
      'missing.md': { key: 'missing.md', missing: true },
    },
    exclusions: {
      '*.test.js': { exclude: true },
    },
    excluded_item_count: 1,
    re_import_queue: {
      'a.md': true,
      'outside.md': true,
    },
  });

  const summary = get_context_summary(ctx);

  t.is(summary.missing_count, 1);
  t.is(summary.exclusion_count, 1);
  t.is(summary.pending_update_count, 1);
});

test('observed named-context warnings clear when the named context exists', (t) => {
  const ctx = build_context({
    context_items_data: {
      Shared: { key: 'Shared', named_context: true },
    },
    named_contexts: {
      Shared: {},
    },
  });

  const summary = get_context_summary(ctx, {
    observed_missing_keys: ['Shared'],
  });

  t.is(summary.missing_count, 0);
});

test('reports folder selections whose resolved contents were truncated', (t) => {
  const ctx = build_context({
    context_items_data: {
      'external:../repo': {
        key: 'external:../repo',
        folder: true,
        group_items_ct: 1000,
        truncated: true,
        truncated_max_items: 1000,
      },
    },
  });

  const summary = get_context_summary(ctx);

  t.is(summary.truncated_selection_count, 1);
  t.is(summary.source_count, 1000);
});

test('marks source count unknown when a group has no cached item count', (t) => {
  const ctx = build_context({
    context_items_data: {
      Folder: { key: 'Folder', folder: true },
      'direct.md': { key: 'direct.md' },
    },
  });

  const summary = get_context_summary(ctx);

  t.is(summary.selection_count, 2);
  t.is(summary.source_count, 2);
  t.false(summary.source_count_known);
});

test('formats estimates and bytes independently', (t) => {
  t.is(format_context_estimate(867), '867');
  t.is(format_context_estimate(1100), '1.1K');
  t.is(format_context_estimate(12000), '12K');
  t.is(format_byte_count(1536), '1.5 KB');
});

test('uses tree-resolved items for exact grouped source and size summaries', (t) => {
  const ctx = build_context({
    context_items_data: {
      Folder: { key: 'Folder', folder: true, group_items_ct: 2 },
    },
  });

  const summary = get_context_summary(ctx, {
    context_items: [
      { key: 'Folder/note.md', size: 400, is_media: false },
      { key: 'Folder/image.png', size: 2048, is_media: true },
    ],
  });

  t.is(summary.selection_count, 1);
  t.is(summary.source_count, 2);
  t.true(summary.source_count_known);
  t.is(summary.estimated_text_chars, 400);
  t.is(summary.estimated_tokens, 100);
  t.is(summary.media_count, 1);
  t.is(summary.media_bytes, 2048);
});
