const CODEBLOCK_HELP_URL = 'https://smartconnections.app/smart-context/codeblock/?utm_source=codeblock-menu';

/**
 * Open Smart Context codeblock help.
 *
 * @returns {boolean}
 */
export function context_open_codeblock_help() {
  const open_url = globalThis.window?.open || globalThis.open;
  if (typeof open_url !== 'function') return false;

  open_url(CODEBLOCK_HELP_URL, '_external');
  return true;
}

export const menus = {
  'smart_context:codeblock_menu': {
    title: 'Help with context codeblock',
    icon: 'help-circle',
    order: 100,
  },
};
