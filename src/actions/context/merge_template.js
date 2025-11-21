import { build_file_tree_string } from 'smart-utils/file_tree.js';

// THIS SHOULD BE HANDLED MUCH BETTER IN ARCHITECTURE AND REPLACEMENT LOGIC
// LEZER?
export async function merge_template(context_items_text, context_items) {
  const MERGE_VARS = {
    'FILE_TREE': () => {
      return build_file_tree_string(context_items.map(c => c.key));
    },
  }
  const replace_vars = async (template) => {
    const number_of_var_matches = (template.match(/{{(\w+)}}/g) || []).length;
    for (let i = 0; i < number_of_var_matches; i++) {
      template = template.replace(/{{(\w+)}}/gi, (match, p1) => {
        return MERGE_VARS[p1]?.() || '';
      });
    }
    return template;
  };
  const before = await replace_vars(this.settings.template_before || default_settings.template_before);
  const after = await replace_vars(this.settings.template_after || default_settings.template_after);
  return [before, context_items_text, after].join('\n');
}
export const settings_config = {
  template_before: {
    type: 'textarea',
    name: 'Template Before',
    description: 'Template to wrap before the context.',
  },
  template_after: {
    type: 'textarea',
    name: 'Template After',
    description: 'Template to wrap after the context.',
  },
};
export const default_settings = {
  template_before: '<context>\n{{FILE_TREE}}',
  template_after: '</context>',
};