import {
  build_context_result,
  context_result_schema,
  create_named_context,
  to_trimmed_string,
} from '../../utils/tool_context.js';

export async function smart_contexts_create(params = {}) {
  const name = to_trimmed_string(params.name);
  if (!name) throw new Error('Missing required argument: name');

  const { context, created } = await create_named_context(this, name);
  return {
    ...build_context_result(context),
    action: 'create',
    created,
    added: [],
    added_total: 0,
  };
}

export const display_name = 'Create Smart Context';
export const display_description = 'Creates a named Smart Context or returns the existing one.';
export const input_schema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      description: 'Smart Context name.',
    },
  },
  required: ['name'],
  additionalProperties: false,
};
export const output_schema = {
  ...context_result_schema,
  properties: {
    ...context_result_schema.properties,
    action: { type: 'string', enum: ['create'] },
    created: { type: 'boolean' },
    added: {
      type: 'array',
      items: { type: 'string' },
    },
    added_total: { type: 'integer' },
  },
  required: [
    ...context_result_schema.required,
    'action',
    'created',
    'added',
    'added_total',
  ],
};
export const action_scope = {
  type: 'collection',
  collection_key: 'smart_contexts',
};
export const tool = {
  name: 'smart_context_create',
  when({ env }) {
    return Boolean(env.smart_contexts);
  },
  effects: {
    read_only: false,
    destructive: false,
    idempotent: true,
  },
};
