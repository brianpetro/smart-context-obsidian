/**
 * Partition named contexts into root rows and slash-based hierarchy groups.
 *
 * @param {Array<import('smart-contexts').SmartContext>} items
 * @returns {{root_items: Array<import('smart-contexts').SmartContext>, grouped_items: Map<string, Array<{ctx: import('smart-contexts').SmartContext, display_name: string}>>}}
 */
export function partition_context_hierarchy(items = []) {
  const root_items = [];
  const grouped_items = new Map();

  for (const ctx of items) {
    const raw_name = String(ctx?.data?.name ?? '').trim();
    const separator_index = raw_name.indexOf('/');
    if (separator_index < 1 || separator_index === raw_name.length - 1) {
      root_items.push(ctx);
      continue;
    }
    const group_name = raw_name.slice(0, separator_index).trim();
    const display_name = raw_name.slice(separator_index + 1).trim();
    if (!group_name || !display_name) {
      root_items.push(ctx);
      continue;
    }
    if (!grouped_items.has(group_name)) {
      grouped_items.set(group_name, []);
    }
    grouped_items.get(group_name).push({ ctx, display_name });
  }

  const compare_names = (a, b) => {
    const left = String(a?.data?.name ?? '').toLocaleLowerCase();
    const right = String(b?.data?.name ?? '').toLocaleLowerCase();
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  };

  root_items.sort(compare_names);

  for (const grouped_contexts of grouped_items.values()) {
    grouped_contexts.sort((left, right) => {
      const left_name = left.display_name.toLocaleLowerCase();
      const right_name = right.display_name.toLocaleLowerCase();
      if (left_name < right_name) return -1;
      if (left_name > right_name) return 1;
      return compare_names(left.ctx, right.ctx);
    });
  }

  return { root_items, grouped_items };
}

/**
 * Resolve whether a hierarchy group should default to open.
 *
 * @param {Array<{ctx: import('smart-contexts').SmartContext}>} grouped_contexts
 * @param {object} params
 * @returns {boolean}
 */
export function should_open_group(grouped_contexts = [], params = {}) {
  const item_key = String(params?.item_key ?? '').trim();
  if (!item_key) return false;
  return grouped_contexts.some((grouped_item) => {
    return String(grouped_item?.ctx?.data?.key ?? '') === item_key;
  });
}
