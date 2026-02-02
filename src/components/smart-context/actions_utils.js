/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {object} [params]
 * @param {string} [params.input_value]
 * @returns {{is_saved: boolean, label: string}}
 */
export function resolve_name_status(ctx, params = {}) {
  const input_value = String(params.input_value ?? '');
  const stored_name = String(ctx?.data?.name ?? '');
  const trimmed_input = input_value.trim();
  const trimmed_name = stored_name.trim();
  const is_saved = trimmed_name.length > 0 && trimmed_input === trimmed_name;
  return {
    is_saved,
    label: is_saved ? 'Saved' : '',
  };
}
