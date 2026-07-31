import test from 'ava';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { merge_env_config } from '../../../../jsbrains/smart-environment/utils/merge_env_config.js';
import {
  connections_list_send_to_context as placeholder_action,
  menus as placeholder_menus,
  version as placeholder_version,
} from '../../../../smart-connections-obsidian/src/actions/connections-list/send_to_context.js';
import {
  connections_list_send_to_context as context_action,
  menus as context_menus,
  version as context_version,
} from './send_to_context.js';

const dir_name = path.dirname(fileURLToPath(import.meta.url));
const menu_key = 'connections:list_menu';

function build_action_config(root_version, action, menus, version) {
  return {
    version: root_version,
    actions: {
      connections_list_send_to_context: {
        action,
        menus: {
          [menu_key]: {
            ...menus[menu_key],
          },
        },
        version,
      },
    },
  };
}

test('Context override owns result normalization and delegates Context lifecycle', (t) => {
  const open_new_calls = [];
  const emitted_events = [];
  const visible_result = {
    item: {
      key: 'Notes/Visible.md',
    },
    score: 0.75,
  };
  const hidden_result = {
    item: {
      key: 'Notes/Hidden.md',
    },
    score: 0.6,
  };
  const smart_context = {
    key: 'context:test',
  };
  const smart_contexts = {
    actions: {
      smart_contexts_open_new(params) {
        open_new_calls.push(params);
        return smart_context;
      },
    },
    new_context() {
      t.fail('The integration action must use smart_contexts_open_new.');
    },
    open_builder() {
      t.fail('The integration action must not open the Builder directly.');
    },
  };
  const scope = {
    env: {
      events: {
        emit(event_key, event) {
          emitted_events.push({ event_key, event });
        },
      },
      smart_contexts,
    },
    item: {
      key: 'Notes/Source.md',
      score: 0.9,
    },
    results: [visible_result, hidden_result],
    emit_event(event_key) {
      emitted_events.push({ event_key });
    },
  };

  const result = context_action.call(scope, {
    visible_results: [
      visible_result,
      {
        item: {
          key: 'Notes/Source.md',
        },
        score: 0.5,
      },
      {
        item: {
          key: 'Notes/Visible.md',
        },
        score: 0.4,
      },
    ],
    event_source: 'connections_codeblock.send_to_smart_context',
  });

  t.true(result);
  t.deepEqual(open_new_calls, [{
    add_items: [
      {
        key: 'Notes/Source.md',
        score: 0.9,
      },
      {
        key: 'Notes/Visible.md',
        score: 0.75,
      },
    ],
    event_source: 'connections_codeblock.send_to_smart_context',
  }]);
  t.deepEqual(emitted_events, [{
    event_key: 'connections:sent_to_context',
  }]);
});

test('Context override handles empty input without creating or opening a Context', (t) => {
  const emitted_events = [];
  const scope = {
    env: {
      events: {
        emit(event_key, event) {
          emitted_events.push({ event_key, event });
        },
      },
      smart_contexts: {
        actions: {
          smart_contexts_open_new() {
            t.fail('Empty input must not invoke Context lifecycle.');
          },
        },
      },
    },
    item: {
      key: 'Notes/Source.md',
    },
    results: [{
      item: {
        key: 'Notes/Cached.md',
      },
      score: 0.5,
    }],
    emit_event() {
      t.fail('Empty input must not emit success.');
    },
  };

  const result = context_action.call(scope, {
    visible_results: [],
    event_source: 'test.empty_connections_context',
  });

  t.false(result);
  t.true(context_menus[menu_key].disabled.call({
    scope,
    params: {
      visible_results: [],
    },
  }));
  t.deepEqual(emitted_events, [{
    event_key: 'connections:send_to_context_empty',
    event: {
      level: 'warning',
      message: 'No connection results to send to context.',
      event_source: 'test.empty_connections_context',
    },
  }]);
});

test('Context action version wins placeholder and legacy convergence in either load order', (t) => {
  const legacy_connections_action = () => 'legacy';
  const legacy_menus = {
    [menu_key]: {
      ...placeholder_menus[menu_key],
      disabled() {
        return false;
      },
    },
  };
  const placeholder_config = build_action_config(
    '4.5.3',
    placeholder_action,
    placeholder_menus,
    placeholder_version,
  );
  const legacy_config = build_action_config(
    '4.5.3',
    legacy_connections_action,
    legacy_menus,
    '2.4.6',
  );
  const context_config = build_action_config(
    '3.1.2',
    context_action,
    context_menus,
    context_version,
  );

  [placeholder_config, legacy_config].forEach((connections_config) => {
    [
      [connections_config, context_config],
      [context_config, connections_config],
    ].forEach((configs) => {
      const merged = {};
      configs.forEach((config) => merge_env_config(merged, config));

      const action_entry =
        merged.actions.connections_list_send_to_context
      ;
      t.is(action_entry.action, context_action);
      t.is(action_entry.version, '3.0.0');
      t.is(
        action_entry.menus[menu_key].disabled,
        context_menus[menu_key].disabled,
      );
      t.is(action_entry.menus[menu_key].title, 'Send to Smart Context');
    });
  });
});

test('generated configs preserve explicit placeholder and override versions', (t) => {
  const external_dir = path.resolve(dir_name, '../../../..');
  const connections_config = fs.readFileSync(
    path.join(
      external_dir,
      'smart-connections-obsidian/smart_env.config.js',
    ),
    'utf8',
  );
  const context_config = fs.readFileSync(
    path.join(
      external_dir,
      'smart-context-obsidian/smart_env.config.js',
    ),
    'utf8',
  );
  const version_entry =
    'version: connections_list_send_to_context_action_version'
  ;

  t.true(connections_config.includes(
    'version as connections_list_send_to_context_action_version',
  ));
  t.true(connections_config.includes(version_entry));
  t.true(context_config.includes(
    "from './src/actions/connections-list/send_to_context.js';",
  ));
  t.true(context_config.includes(
    'version as connections_list_send_to_context_action_version',
  ));
  t.true(context_config.includes(version_entry));
});
