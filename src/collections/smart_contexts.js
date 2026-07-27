import base, { SmartContexts as BaseClass } from 'obsidian-smart-env/src/collections/smart_contexts.js';
import { is_codeblock_context_key } from '../utils/pure_utils.js';

export class SmartContexts extends BaseClass {
  /**
   * Open the canonical Builder for a Smart Context.
   *
   * The established context_selector event remains the compatibility transport
   * for commands and integrations.
   *
   * @param {import('smart-contexts').SmartContext} ctx
   * @param {object} [params={}]
   * @returns {boolean}
   */
  open_builder(ctx, params = {}) {
    if (typeof ctx?.emit_event !== 'function') return false;
    ctx.emit_event('context_selector:open', params);
    return true;
  }

  async process_load_queue() {
    await super.process_load_queue?.();

    Object.entries(this.items || {}).forEach(([key, item]) => {
      // 2025-12-17: cleanup - remove codeblock items (should be handled better, no save in first place)
      // remove items that endsWith '#codeblock'
      if (!is_codeblock_context_key(key)) return;
      item.delete?.();
      // 2026-03-25: clarified which contexts must be persisted: named, associated with chat (needs clarified data structure for detection)
    });

    this.process_save_queue?.();
  }
}

base.class = SmartContexts;
base.version = BaseClass.version;

export default base;
