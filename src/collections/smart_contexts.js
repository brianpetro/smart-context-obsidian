import base from 'smart-contexts';
import { SmartContexts as BaseClass } from 'smart-contexts/smart_contexts.js';
import { is_codeblock_context_key } from '../utils/context_codeblock_utils.js';

export class SmartContexts extends BaseClass {
  async process_load_queue() {
    await super.process_load_queue?.();

    Object.entries(this.items || {}).forEach(([key, item]) => {
      // 2025-12-17: cleanup - remove codeblock items (should be handled better, no save in first place)
      // remove items that endsWith '#codeblock'
      if (!is_codeblock_context_key(key)) return;
      item.delete?.();
    });

    this.process_save_queue?.();
  }
}

base.class = SmartContexts;
base.version = BaseClass.version;

export default base;
