import {
  create_copy_context_depth_action,
  create_copy_context_depth_menus,
  smart_context_action_scope,
} from '../../utils/copy_context_depth.js';

const max_supported_depth = 2;

export const display_name = 'Copy at link depth';
export const action_scope = smart_context_action_scope;

export const context_copy_at_depth =
  create_copy_context_depth_action(max_supported_depth);

export const menus =
  create_copy_context_depth_menus(max_supported_depth);
