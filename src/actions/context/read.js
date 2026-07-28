import {
  context_name_action_scope,
} from '../../utils/tool_context.js';

export async function context_read() {
  if (typeof this.get_text !== 'function') {
    throw new Error('Unable to compile Smart Context.');
  }
  const result = await this.get_text();
  if (result === null || result === undefined) return '';
  return typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2)
  ;
}

export const display_name = 'Read Smart Context';
export const display_description = 'Compiles and returns the text for a named Smart Context.';
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
export const output_schema = {
  type: 'string',
};
export const action_scope = context_name_action_scope;
export const tool = {
  name: 'smart_context_read',
  when({ env }) {
    return Boolean(env.smart_contexts);
  },
  effects: {
    read_only: true,
    destructive: false,
    idempotent: true,
  },
};
