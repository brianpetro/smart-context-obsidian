import test from 'ava';
import { partition_context_hierarchy, should_open_group } from './list_hierarchy.js';

function create_context({ name, key }) {
  return {
    data: {
      name,
      key,
    },
  };
}

test('partition_context_hierarchy groups slash-based names and sorts roots', (t) => {
  const items = [
    create_context({ name: 'Work/alpha', key: '2' }),
    create_context({ name: 'Root B', key: '1' }),
    create_context({ name: 'Work/beta', key: '3' }),
    create_context({ name: 'Root A', key: '4' }),
  ];

  const { root_items, grouped_items } = partition_context_hierarchy(items);

  t.deepEqual(root_items.map((item) => item.data.name), ['Root A', 'Root B']);
  t.true(grouped_items.has('Work'));
  t.deepEqual(
    grouped_items.get('Work').map((item) => item.display_name),
    ['alpha', 'beta']
  );
});

test('should_open_group opens when params item_key is part of grouped contexts', (t) => {
  const grouped_contexts = [
    { ctx: create_context({ name: 'Team/alpha', key: 'ctx-alpha' }), display_name: 'alpha' },
    { ctx: create_context({ name: 'Team/beta', key: 'ctx-beta' }), display_name: 'beta' },
  ];

  t.true(should_open_group(grouped_contexts, { item_key: 'ctx-beta' }));
  t.false(should_open_group(grouped_contexts, { item_key: 'ctx-gamma' }));
  t.false(should_open_group(grouped_contexts, {}));
});
