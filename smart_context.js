/**
 * @file smart_context_module.js
 * @description Refactored SmartContext module that uses a SmartFs instance.
 */

import {
  strip_excluded_sections,
  remove_included_link_lines,
  inline_embedded_links
} from './utils.js';

/**
 * @typedef {Object} SmartContextFs
 * @property {(filePath: string, encoding?: string) => Promise<string>} read
 * @property {(linkText: string, currentFilePath: string) => string|undefined} get_link_target_path
 */

/**
 * @typedef {Object} BuildContextOptions
 * @property {string} mode - 'folder' | 'visible' | 'all-open' | 'visible-linked' | 'all-open-linked'
 * @property {string} [label]
 * @property {string} [folder_structure]
 * @property {{ path: string }[]} [files]
 * @property {{ path: string }[]} [initial_files]
 * @property {{ path: string }[]} [all_files]
 * @property {string[]} [excluded_headings]
 * @property {string} [active_file_path] - If `skip_exclude_links_in_active_file` is set, do not strip link-only lines in this file
 * @property {string} [before_prompt]
 * @property {string} [before_each_prompt]
 * @property {string} [after_each_prompt]
 * @property {string} [after_prompt]
 */

/**
 * A module for building "smart context" from multiple notes. 
 * This class is library-agnostic: it does not rely on Obsidian’s APIs.
 */
export class SmartContext {
  /**
   * @param {Object} opts
   * @param {SmartContextFs} opts.fs - A SmartFs instance for reading files, resolving links, etc.
   * @param {string[]} [opts.excluded_headings=[]]
   * @param {boolean} [opts.skip_exclude_links_in_active_file=false] - If true, do not strip link lines in the active file
   */
  constructor(opts) {
    this.fs = opts.fs;
    this.default_excluded_headings = opts.excluded_headings || [];
    this.skip_exclude_links_in_active_file = !!opts.skip_exclude_links_in_active_file;
  }

  /**
   * Build a final string that aggregates the requested files/folders.
   * @param {BuildContextOptions} context_opts
   * @returns {Promise<string>} The combined string to copy to clipboard.
   */
  async build_context(context_opts) {
    const {
      mode,
      label = '',
      folder_structure = '',
      files = [],
      initial_files = [],
      all_files = [],
      excluded_headings = this.default_excluded_headings,
      active_file_path = '',

      before_prompt = '',
      before_each_prompt = '',
      after_each_prompt = '',
      after_prompt = ''
    } = context_opts;

    let content_to_copy = '';

    // Insert top-level "before_prompt"
    if (before_prompt) {
      content_to_copy += `${before_prompt}\n`;
    }

    // Track excluded sections if needed
    let total_excluded_sections = 0;

    if (mode === 'folder') {
      content_to_copy += `${label}:\n${folder_structure}\nFile contents:\n`;
      for (const file of files) {
        if (before_each_prompt) {
          content_to_copy += `${before_each_prompt}\n`;
        }
        const processed = await this.#process_file(file.path, excluded_headings);
        total_excluded_sections += processed.excluded_count;
        content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed.content}\n-----------------------\n\n`;

        if (after_each_prompt) {
          content_to_copy += `${after_each_prompt}\n`;
        }
      }
    }
    else if (mode === 'visible' || mode === 'all-open') {
      content_to_copy += `${label}:\n`;
      for (const file of files) {
        if (before_each_prompt) content_to_copy += `${before_each_prompt}\n`;

        const processed = await this.#process_file(file.path, excluded_headings);
        total_excluded_sections += processed.excluded_count;

        content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed.content}\n-----------------------\n\n`;
        if (after_each_prompt) content_to_copy += `${after_each_prompt}\n`;
      }
    }
    else if (mode === 'visible-linked' || mode === 'all-open-linked') {
      const initPaths = new Set(initial_files.map(f => f.path));
      const linked_only = all_files.filter(f => !initPaths.has(f.path));
      
      if (linked_only.length > 0) {
        content_to_copy += `Linked files:\n`;
        for (const lf of linked_only) {
          if (before_each_prompt) content_to_copy += `${before_each_prompt}\n`;

          const processed = await this.#process_file(lf.path, excluded_headings);
          total_excluded_sections += processed.excluded_count;

          content_to_copy += `----------------------\n/${lf.path}\n-----------------------\n${processed.content}\n\n-----------------------\n\n`;
          if (after_each_prompt) content_to_copy += `${after_each_prompt}\n`;
        }
      }

      content_to_copy += `\n${label}:\n`;
      for (const file of initial_files) {
        const skipLinkRemoval = (this.skip_exclude_links_in_active_file && file.path === active_file_path);
        if (before_each_prompt) content_to_copy += `${before_each_prompt}\n`;

        const processed = await this.#process_file_inlined_embeds(file.path, excluded_headings, initPaths, skipLinkRemoval);
        total_excluded_sections += processed.excluded_count;

        content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed.content}\n`;
        if (after_each_prompt) content_to_copy += `${after_each_prompt}\n`;
      }
    }

    // Insert bottom-level "after_prompt"
    if (after_prompt) {
      content_to_copy += `\n${after_prompt}\n`;
    }

    return content_to_copy;
  }

  /**
   * Basic file read + heading exclusion
   * @private
   */
  async #process_file(filePath, excluded) {
    let raw = '';
    try {
      raw = await this.fs.read(filePath, 'utf-8');
    } catch (e) {
      raw = '';
    }
    const { processed_content, excluded_count } = strip_excluded_sections(raw, excluded);
    return { content: processed_content, excluded_count };
  }

  /**
   * Read + inline embedded links + remove link-only lines (unless skipping) + exclude headings
   * @private
   */
  async #process_file_inlined_embeds(filePath, excluded, initPaths, skipLinkRemoval=false) {
    let raw = '';
    try {
      raw = await this.fs.read(filePath, 'utf-8');
    } catch (e) {
      raw = '';
    }
    // inline embedded links
    raw = await inline_embedded_links(
      raw,
      filePath,
      (linkText, curPath) => this.fs.get_link_target_path(linkText, curPath),
      async (fp) => {
        try {
          return await this.fs.read(fp, 'utf-8');
        } catch(e) {
          return '';
        }
      },
      excluded,
      // just a stub, returns no actual embedded-file list
      () => new Set()
    );

    // remove link-only lines
    if (!skipLinkRemoval) {
      raw = remove_included_link_lines(
        raw,
        initPaths,
        (linkText) => this.fs.get_link_target_path(linkText, filePath)
      );
    }

    // exclude headings
    const { processed_content, excluded_count, excluded_sections } = strip_excluded_sections(raw, excluded);
    return { content: processed_content, excluded_count, excluded_sections };
  }

  /**
   * Exposes a settings config object for use in SmartView
   */
  get settings_config() {
    return {
      excluded_headings: {
        name: 'Excluded Headings',
        description: 'Headings to exclude from the copied context. One heading per line.',
        type: 'textarea',
        default: '',
      },
      skip_exclude_links_in_active_file: {
        name: 'Skip Link-Only Removal in Active Note',
        description: 'If ON, we do NOT remove link-only lines in the currently active note.',
        type: 'toggle',
        default: false,
      },
      before_prompt: {
        name: 'Before Prompt (once)',
        description: 'Text inserted at the very top of the output.',
        type: 'textarea',
        default: '',
      },
      before_each_prompt: {
        name: 'Before Each File',
        description: 'Text inserted before each file’s content.',
        type: 'textarea',
        default: '',
      },
      after_each_prompt: {
        name: 'After Each File',
        description: 'Text inserted after each file’s content.',
        type: 'textarea',
        default: '',
      },
      after_prompt: {
        name: 'After Prompt (once)',
        description: 'Text inserted at the very bottom of the output.',
        type: 'textarea',
        default: '',
      }
    };
  }
}
