export function filter_redundant_blocks(items = []) {
  const parents = new Set();
  for (const { path } of items) {
    if (!path.includes('#')) parents.add(path);
  }
  return items.filter(({ path }) => {
    if (!path.includes('#')) return true;
    const base = path.split('#')[0];
    return !parents.has(base);
  });
}

export default filter_redundant_blocks;
