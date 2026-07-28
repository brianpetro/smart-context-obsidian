import {
  build_context_result,
  context_name_action_scope,
  context_result_schema,
  normalize_context_item_key,
  remove_context_item,
} from '../../utils/tool_context.js';

export async function context_remove(params = {}) {
  const item_key = normalize_context_item_key(this.env, params.item);
  if (!item_key) throw new Error('Missing required argument: item');

  const removed = await remove_context_item(this, item_key);
  return {
    ...build_context_result(this),
    action: 'remove',
    removed,
    removed_total: removed.length,
    requested_total: 1,
  };
}

export const display_name = 'Remove from Smart Context';
export const display_description = 'Removes one vault-relative source, block, or external path from a named Smart Context.';
export const input_schema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      description: 'Smart Context name or key.',
    },
    item: {
      type: 'string',
      minLength: 1,
      description: 'Vault-relative source/block key, or an outside-vault path relative to the vault.',
    },
  },
  required: ['name', 'item'],
  additionalProperties: false,
};
export const output_schema = {
  ...context_result_schema,
  properties: {
    ...context_result_schema.properties,
    action: { type: 'string', enum: ['remove'] },
    removed: {
      type: 'array',
      items: { type: 'string' },
    },
    removed_total: { type: 'integer' },
    requested_total: { type: 'integer' },
  },
  required: [
    ...context_result_schema.required,
    'action',
    'removed',
    'removed_total',
    'requested_total',
  ],
};
export const action_scope = context_name_action_scope;
export const tool = {
  name: 'smart_context_remove',
  when({ env }) {
    return Boolean(env.smart_contexts);
  },
  effects: {
    read_only: false,
    destructive: true,
    idempotent: true,
  },
};
