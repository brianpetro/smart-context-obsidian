import {
  build_context_result,
  context_name_action_scope,
  context_result_schema,
} from '../../utils/tool_context.js';

export function context_get() {
  return build_context_result(this);
}

export const display_name = 'Get Smart Context';
export const display_description = 'Returns a named Smart Context and its item manifest.';
export const input_schema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      description: 'Smart Context name or key.',
    },
  },
  required: ['name'],
  additionalProperties: false,
};
export const output_schema = context_result_schema;
export const action_scope = context_name_action_scope;
export const tool = {
  name: 'smart_context_get',
  when({ env }) {
    return Boolean(env.smart_contexts);
  },
  effects: {
    read_only: true,
    destructive: false,
    idempotent: true,
  },
};
