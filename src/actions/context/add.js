import {
  add_context_item,
  build_context_result,
  context_name_action_scope,
  context_result_schema,
  normalize_context_item_key,
} from '../../utils/tool_context.js';

export async function context_add(params = {}) {
  const item_key = normalize_context_item_key(this.env, params.item);
  if (!item_key) throw new Error('Missing required argument: item');

  const added = await add_context_item(this, item_key);
  return {
    ...build_context_result(this),
    action: 'add',
    added,
    added_total: added.length,
    requested_total: 1,
  };
}

export const display_name = 'Add to Smart Context';
export const display_description = 'Adds one vault-relative source, block, or external path to a named Smart Context.';
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
    action: { type: 'string', enum: ['add'] },
    added: {
      type: 'array',
      items: { type: 'string' },
    },
    added_total: { type: 'integer' },
    requested_total: { type: 'integer' },
  },
  required: [
    ...context_result_schema.required,
    'action',
    'added',
    'added_total',
    'requested_total',
  ],
};
export const action_scope = context_name_action_scope;
export const tool = {
  name: 'smart_context_add',
  when({ env }) {
    return Boolean(env.smart_contexts);
  },
  effects: {
    read_only: false,
    destructive: false,
    idempotent: true,
  },
};
