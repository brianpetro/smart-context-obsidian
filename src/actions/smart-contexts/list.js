import {
  build_context_list_result,
} from '../../utils/tool_context.js';

export function smart_contexts_list() {
  return build_context_list_result(this);
}

export const display_name = 'List Smart Contexts';
export const display_description = 'Lists the names of available Smart Contexts.';
export const input_schema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
export const output_schema = {
  type: 'object',
  properties: {
    total: { type: 'integer' },
    names: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['total', 'names'],
  additionalProperties: false,
};
export const action_scope = {
  type: 'collection',
  collection_key: 'smart_contexts',
};
export const tool = {
  name: 'smart_context_list',
  when({ env }) {
    return Boolean(env.smart_contexts);
  },
  effects: {
    read_only: true,
    destructive: false,
    idempotent: true,
  },
};
