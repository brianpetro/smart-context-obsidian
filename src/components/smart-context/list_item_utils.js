/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {boolean}
 */
export function can_delete_context(ctx) {
  const context_name = String(ctx?.data?.name ?? '').trim();
  return context_name.length > 0;
}
