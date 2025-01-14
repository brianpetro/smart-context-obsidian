/**
 * smart_contexts.js
 * 
 * @fileoverview
 * Provides the SmartContexts collection class and its updated implementation 
 * based on the latest specs, including the new 'respect_exclusions' logic.
 */

import { Collection } from 'smart-collections';
import { SmartContext } from './smart_context.js';

/**
 * @class SmartContexts
 * @extends Collection
 * @classdesc Manages a collection of SmartContext items, each representing a set of 
 * references or data relevant to a specific use-case. Handles link_depth, 
 * inlinks, excluded_headings, and context-building logic.
 */
export class SmartContexts extends Collection {
  /**
   * Default settings for SmartContexts. Matches updated specs fields.
   * @readonly
   */
  get default_settings() {
    return {
      link_depth: 0,
      inlinks: false,
      excluded_headings: [],
      before_context: '',
      after_context: '',
      before_item: '',
      after_item: '',
      before_link: '',
      after_link: '',
    };
  }

  /**
   * The item type used by this collection (SmartContext).
   * @readonly
   */
  get item_type() {
    return SmartContext;
  }

  get settings_config() {
    return {
      link_depth: {
        name: 'Link depth',
        description: 'Number of links to follow from the start item.',
        type: 'number',
      },
      inlinks: {
        name: 'In-links',
        description: 'Whether to include in-links in get_links() result.',
        type: 'toggle',
      },
      excluded_headings: {
        name: 'Excluded headings',
        description: 'Glob patterns or headings to exclude from the items content.',
        type: 'textarea_array',
      },
      before_context: {
        name: 'Before context (string)',
        description: 'Text inserted at the top of the final compiled text (supports {{FILE_TREE}}).',
        type: 'textarea',
      },
      after_context: {
        name: 'After context (string)',
        description: 'Text inserted at the bottom of the final compiled text (supports {{FILE_TREE}}).',
        type: 'textarea',
      },
      before_item: {
        name: 'Before each item',
        description: 'Text inserted before each item (supports {{ITEM_PATH}}, {{ITEM_NAME}}).',
        type: 'textarea',
      },
      after_item: {
        name: 'After each item',
        description: 'Text inserted after each item (supports {{ITEM_PATH}}, {{ITEM_NAME}}).',
        type: 'textarea',
      },
      before_link: {
        name: 'Before each link',
        description: 'Text inserted before each link item (supports link placeholders).',
        type: 'textarea',
      },
      after_link: {
        name: 'After each link',
        description: 'Text inserted after each link item (supports link placeholders).',
        type: 'textarea',
      },
    };
  }
}

export default { SmartContexts };
