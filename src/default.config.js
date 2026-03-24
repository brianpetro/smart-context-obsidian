import { CopyContextModal } from './modals/copy_context_modal';
import { merge_env_config } from 'obsidian-smart-env';
import { smart_env_config as compiled_config } from '../smart_env.config.js';

const default_config = {
  modals: {
    copy_context_modal: {
      class: CopyContextModal,
    },
  },
};

const smart_env_config = merge_env_config(compiled_config, default_config);

export { smart_env_config };
