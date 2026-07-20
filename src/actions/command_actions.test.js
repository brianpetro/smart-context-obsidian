import test from 'ava';
import {
  register_command_actions,
} from 'obsidian-smart-env/src/utils/command_actions.js';
import {
  register_ribbon_actions,
} from 'obsidian-smart-env/src/utils/ribbon_actions.js';
import {
  env_copy_folder_to_clipboard,
  commands as folder_commands,
} from './env/copy_folder_to_clipboard.js';
import {
  smart_contexts_insert_codeblock,
  commands as insert_commands,
} from './smart-contexts/insert_codeblock.js';
import {
  smart_contexts_open_dashboard,
  ribbon_icons as dashboard_ribbon_icons,
} from './smart-contexts/open_dashboard.js';
import {
  smart_contexts_open_new,
  commands as open_new_commands,
  ribbon_icons as open_new_ribbon_icons,
} from './smart-contexts/open_new.js';
import {
  smart_contexts_open_onboarding,
  commands as onboarding_commands,
} from './smart-contexts/open_onboarding.js';
import {
  source_copy_current,
  commands as copy_commands,
  ribbon_icons as copy_ribbon_icons,
} from './source/copy_current.js';

const EXPECTED_COMMAND_IDS = [
  'copy-current-note-depth-0',
  'copy-current-note-depth-1',
  'copy-current-note-depth-1-with-backlinks',
  'copy-current-note-link-tree',
  'copy-current-note-with-depth',
  'copy-folder-to-clipboard',
  'external-file-codeblock',
  'new-context-open-selector',
  'show-getting-started',
];

const EXPECTED_RIBBON_IDS = [
  'copy_context',
  'list_contexts',
  'new_context',
];

function build_env() {
  const env = {
    config: {
      actions: {},
      modals: {
        copy_context_modal: {
          class: class CopyContextModal {},
        },
      },
    },
  };
  const source = {
    env,
    file_type: 'md',
  };
  const smart_contexts = {
    env,
    get() {
      return null;
    },
    new_context() {
      return {
        env,
        data: {},
        emit_event() {},
      };
    },
  };

  env.smart_contexts = smart_contexts;
  env.smart_sources = {
    get(source_key) {
      return source_key === 'Note.md'
        ? source
        : null
      ;
    },
  };
  env.config.actions = {
    env_copy_folder_to_clipboard: {
      action: env_copy_folder_to_clipboard,
      commands: folder_commands,
    },
    smart_contexts_insert_codeblock: {
      action: smart_contexts_insert_codeblock,
      commands: insert_commands,
    },
    smart_contexts_open_dashboard: {
      action: smart_contexts_open_dashboard,
      ribbon_icons: dashboard_ribbon_icons,
    },
    smart_contexts_open_new: {
      action: smart_contexts_open_new,
      commands: open_new_commands,
      ribbon_icons: open_new_ribbon_icons,
    },
    smart_contexts_open_onboarding: {
      action: smart_contexts_open_onboarding,
      commands: onboarding_commands,
    },
    source_copy_current: {
      action: source_copy_current,
      commands: copy_commands,
      ribbon_icons: copy_ribbon_icons,
    },
  };

  return env;
}

function build_plugin(env, params = {}) {
  const registered_commands = [];
  const registered_ribbons = [];
  const active_view = {
    file: { path: 'Note.md' },
    editor: {
      getValue() {
        return '# Note';
      },
    },
  };
  const plugin = {
    manifest: {
      id: params.plugin_id || 'smart-context',
    },
    env,
    app: {
      workspace: {
        getActiveViewOfType() {
          return active_view;
        },
        getActiveFile() {
          return active_view.file;
        },
      },
    },
    addCommand(command) {
      registered_commands.push(command);
    },
    addRibbonIcon(icon_name, description, callback) {
      registered_ribbons.push({
        icon_name,
        description,
        callback,
      });
    },
  };

  return {
    plugin,
    registered_commands,
    registered_ribbons,
  };
}

test('context command actions replace the legacy command getter', (t) => {
  const env = build_env();
  const {
    plugin,
    registered_commands,
  } = build_plugin(env);

  register_command_actions(plugin);

  t.deepEqual(
    registered_commands
      .map(({ id }) => id)
      .sort(),
    [...EXPECTED_COMMAND_IDS].sort(),
  );
});

test('context ribbon icons use action placements', (t) => {
  const env = build_env();
  const {
    plugin,
    registered_ribbons,
  } = build_plugin(env);

  register_ribbon_actions(plugin);

  t.deepEqual(
    [...plugin._registered_ribbon_actions.keys()].sort(),
    [...EXPECTED_RIBBON_IDS].sort(),
  );
  t.deepEqual(
    registered_ribbons
      .map(({ icon_name }) => icon_name)
      .sort(),
    [
      'smart-context-builder',
      'smart-copy-note',
      'smart-named-contexts',
    ].sort(),
  );
});

test('register_when excludes context commands from other plugins', (t) => {
  const env = build_env();
  const {
    plugin,
    registered_commands,
  } = build_plugin(env, {
    plugin_id: 'another-plugin',
  });

  register_command_actions(plugin);

  t.is(registered_commands.length, 0);
});

test('copy command placements preserve fixed-depth and link-tree params', (t) => {
  const env = build_env();
  const { plugin } = build_plugin(env);
  const direct_params =
    copy_commands['copy-current-note-depth-1']
      .params({ plugin });
  const link_tree_params =
    copy_commands['copy-current-note-link-tree']
      .params({ plugin });

  t.is(direct_params.mode, 'direct');
  t.is(direct_params.max_depth, 1);
  t.is(direct_params.include_inlinks, false);
  t.false('include_inlinks' in link_tree_params);
});
