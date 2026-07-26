const copy_depth_menu_key = 'smart_context:copy_depth_menu';

export const smart_context_action_scope = {
  type: 'item',
  collection_key: 'smart_contexts',
  item_arg: 'context_key',
};

/**
 * Return whether the current text context reaches a requested link depth.
 *
 * Availability is depth-based, not variant-based. Outlink-only and backlink
 * variants remain explicit policy choices at every available depth, matching
 * the existing copy-depth selector.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {number} max_depth
 * @returns {boolean}
 */
export function is_copy_context_depth_available(
  ctx,
  max_depth,
) {
  if (!is_valid_depth(max_depth)) return false;
  return get_copy_context_max_depth(ctx) >= max_depth;
}

/**
 * Build a text-copy filter for one link depth.
 *
 * @param {object} [params={}]
 * @param {number} params.max_depth
 * @param {boolean} [params.include_inlinks=false]
 * @param {(item: import('smart-contexts').ContextItem) => boolean} [params.filter]
 * @returns {(item: import('smart-contexts').ContextItem) => boolean}
 */
export function build_copy_context_depth_filter(params = {}) {
  const max_depth = params.max_depth;
  if (!is_valid_depth(max_depth)) {
    throw new TypeError('Copy context depth must be a non-negative integer.');
  }

  const include_inlinks = params.include_inlinks === true;
  const user_filter = typeof params.filter === 'function'
    ? params.filter
    : null
  ;

  return (item) => {
    if (user_filter && !user_filter(item)) return false;
    if (item?.data?.exclude === true) return false;
    if (item?.is_media === true) return false;
    if (get_item_depth(item) > max_depth) return false;
    if (!include_inlinks && item?.data?.inlink === true) return false;
    return true;
  };
}

/**
 * Create the configured action implementation for supported link depths.
 *
 * @param {number} max_supported_depth
 * @returns {function(object=): Promise<boolean>}
 */
export function create_copy_context_depth_action(max_supported_depth) {
  assert_valid_max_supported_depth(max_supported_depth);

  return async function copy_context_depth(params = {}) {
    const max_depth = params.max_depth;
    if (
      !is_valid_depth(max_depth)
      || max_depth > max_supported_depth
    ) {
      return false;
    }

    if (typeof this?.actions?.context_copy_to_clipboard !== 'function') {
      return false;
    }

    const include_inlinks =
      max_depth > 0
      && params.include_inlinks === true
    ;
    const filter = build_copy_context_depth_filter({
      max_depth,
      include_inlinks,
      filter: params.filter,
    });
    const copy_params = {
      filter,
      with_media: false,
      max_depth,
      include_inlinks,
    };

    if (typeof params.event_source !== 'undefined') {
      copy_params.event_source = params.event_source;
    }
    if (typeof params.exclusions !== 'undefined') {
      copy_params.exclusions = params.exclusions;
    }

    return await this.actions.context_copy_to_clipboard(copy_params);
  };
}

/**
 * Create the parent submenu and variant menu placements for supported depths.
 *
 * @param {number} max_supported_depth
 * @returns {object}
 */
export function create_copy_context_depth_menus(max_supported_depth) {
  assert_valid_max_supported_depth(max_supported_depth);

  return {
    'smart_context:copy_menu': {
      order: 0.2,

      when() {
        return is_copy_context_depth_available(this.scope, 0);
      },

      build() {
        add_copy_context_depth_submenu(this);
      },
    },

    [copy_depth_menu_key]: {
      order: 0,

      when() {
        return is_copy_context_depth_available(this.scope, 0);
      },

      build() {
        const max_available_depth = get_copy_context_max_depth(this.scope);
        const menu_max_depth = Math.min(
          max_supported_depth,
          max_available_depth,
        );

        for (
          let max_depth = 0;
          max_depth <= menu_max_depth;
          max_depth += 1
        ) {
          add_copy_context_depth_menu_item(
            this,
            max_depth,
            false,
          );

          if (max_depth > 0) {
            add_copy_context_depth_menu_item(
              this,
              max_depth,
              true,
            );
          }
        }
      },
    },
  };
}

/**
 * @param {object} menu_ctx
 * @returns {void}
 */
function add_copy_context_depth_submenu(menu_ctx) {
  menu_ctx.menu?.addItem?.((item) => {
    item.setTitle?.('Copy text by depth');
    item.setIcon?.('git-branch');

    const submenu = item.setSubmenu?.();
    if (!submenu) {
      item.setDisabled?.(true);
      return;
    }

    menu_ctx.env.build_menu?.(
      copy_depth_menu_key,
      submenu,
      menu_ctx.scope,
      menu_ctx.params,
    );
    item.setDisabled?.(!(submenu.items?.length > 0));
  });
}

/**
 * @param {object} menu_ctx
 * @param {number} max_depth
 * @param {boolean} include_inlinks
 * @returns {void}
 */
function add_copy_context_depth_menu_item(
  menu_ctx,
  max_depth,
  include_inlinks,
) {
  menu_ctx.menu?.addItem?.((item) => {
    item.setTitle?.(get_copy_context_depth_title(
      max_depth,
      include_inlinks,
    ));
    item.setIcon?.(get_copy_context_depth_icon(
      max_depth,
      include_inlinks,
    ));
    item.onClick?.(() => {
      return menu_ctx.run({
        max_depth,
        include_inlinks,
      });
    });
  });
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {number}
 */
function get_copy_context_max_depth(ctx) {
  const context_items = get_active_text_context_items(ctx);
  if (!context_items.length) return -1;

  return context_items.reduce((current_max, item) => {
    return Math.max(current_max, get_item_depth(item));
  }, 0);
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {Array<import('smart-contexts').ContextItem>}
 */
function get_active_text_context_items(ctx) {
  const context_items = ctx?.context_items;
  if (typeof context_items?.filter !== 'function') return [];

  return context_items.filter((item) => {
    return item?.data?.exclude !== true
      && item?.is_media !== true
    ;
  });
}

/**
 * @param {object} item
 * @returns {number}
 */
function get_item_depth(item) {
  const depth = item?.data?.d;
  return Number.isFinite(depth) && depth >= 0
    ? depth
    : 0
  ;
}

/**
 * @param {number} max_depth
 * @param {boolean} include_inlinks
 * @returns {string}
 */
function get_copy_context_depth_title(
  max_depth,
  include_inlinks,
) {
  if (max_depth === 0) return 'Depth 0 - current note';
  return include_inlinks
    ? `Depth ${max_depth} - include backlinks`
    : `Depth ${max_depth} - outlinks only`
  ;
}

/**
 * @param {number} max_depth
 * @param {boolean} include_inlinks
 * @returns {string}
 */
function get_copy_context_depth_icon(
  max_depth,
  include_inlinks,
) {
  if (max_depth === 0) return 'file-text';
  return include_inlinks
    ? 'arrow-left-right'
    : 'arrow-right'
  ;
}

/**
 * @param {number} max_supported_depth
 * @returns {void}
 */
function assert_valid_max_supported_depth(max_supported_depth) {
  if (is_valid_depth(max_supported_depth)) return;
  throw new TypeError(
    'Maximum copy context depth must be a non-negative integer.',
  );
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function is_valid_depth(value) {
  return Number.isInteger(value) && value >= 0;
}
