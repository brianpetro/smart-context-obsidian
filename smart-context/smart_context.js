/**
 * @file smart_context.js
 * @description Refactored SmartContext module that uses a SmartFs instance and a settings object.
 */

import {
  strip_excluded_sections,
  remove_included_link_lines,
  inline_embedded_links,
} from './utils.js';

/**
 * @typedef {Object} SmartContextFs
 * @property {(filePath: string, encoding?: string) => Promise<string>} read
 * @property {(linkText: string, currentFilePath: string) => string|undefined} get_link_target_path
 */

/**
 * @typedef {Object} BuildContextOptions
 * @property {('folder'|'visible'|'all-open'|'visible-linked'|'all-open-linked')} mode
 * @property {string} [label]
 * @property {string} [folder_structure]
 * @property {{path: string}[]} [files]
 * @property {{path: string}[]} [initial_files]
 * @property {{path: string}[]} [all_files]
 * @property {string} [active_file_path]
 * @property {number} [link_depth]
 * @property {string} [before_prompt]
 * @property {string} [before_each_prompt]
 * @property {string} [after_each_prompt]
 * @property {string} [after_prompt]
 * @property {string[]} [excluded_headings]
 * @property {number} [max_linked_files] // newly recognized bounding setting
 */

/**
 * @typedef {Object} SmartContextSettings
 * @property {string[]} excluded_headings
 * @property {string} before_prompt
 * @property {string} before_each_prompt
 * @property {string} after_each_prompt
 * @property {string} after_prompt
 * @property {number} link_depth
 * @property {number} max_linked_files
 */

/**
 * Replace the {{FILE_PATH}} and {{FILE_NAME}} placeholders in a prompt template.
 * @param {string} template - The prompt template to process
 * @param {string} file_path - The file path to inject
 * @returns {string} - Modified template with placeholders replaced
 */
function replace_file_placeholders(template, file_path) {
  const file_name = file_path.substring(file_path.lastIndexOf('/') + 1);
  return template
    .replace(/\{\{FILE_PATH\}\}/g, file_path)
    .replace(/\{\{FILE_NAME\}\}/g, file_name);
}

/**
 * A module for building "smart context" from multiple notes.
 * This class is library-agnostic: it does not rely on Obsidian’s APIs directly.
 */
export class SmartContext {
  /**
   * @param {Object} opts
   * @param {SmartContextFs} opts.fs - A SmartFs instance for reading files, resolving links, etc.
   * @param {SmartContextSettings} opts.settings - The plugin's settings object.
   */
  constructor(opts) {
    this.fs = opts.fs;
    /** @type {SmartContextSettings} */
    this.settings = opts.settings || {
      excluded_headings: [],
      before_prompt: '',
      before_each_prompt: '',
      after_each_prompt: '',
      after_prompt: '',
      link_depth: 0,
      max_linked_files: 0,
    };
  }

  /**
   * Build a final object that aggregates the requested files/folders.
   *
   * Returns:
   * {
   *   context: string,
   *   stats: {
   *     file_count: number,
   *     total_excluded_sections: number,
   *     excluded_sections_map: Map<string, number>
   *   }
   * }
   *
   * @param {BuildContextOptions} context_opts
   * @returns {Promise<{context: string, stats: { file_count: number, total_excluded_sections: number, excluded_sections_map: Map<string, number>}}>}
   */
  async build_context(context_opts) {
    const {
      mode,
      label = '',
      folder_structure = '',
      files = [],
      initial_files = [],
      all_files = [],
      active_file_path = '',
      link_depth = this.settings.link_depth,
      max_linked_files = this.settings.max_linked_files,

      before_prompt = this.settings.before_prompt,
      before_each_prompt = this.settings.before_each_prompt,
      after_each_prompt = this.settings.after_each_prompt,
      after_prompt = this.settings.after_prompt,
    } = context_opts;

    const excluded_headings =
      context_opts.hasOwnProperty('excluded_headings')
        ? context_opts.excluded_headings
        : this.settings.excluded_headings;

    // 1) Use default prompts if user-set strings are empty
    const final_before_each_prompt = before_each_prompt || '<context path="{{FILE_PATH}}">\n';
    const final_after_each_prompt = after_each_prompt || '</context>\n';

    let content_to_copy = '';

    // Stats
    let file_count = 0;
    let total_excluded_sections = 0;
    /** @type {Map<string, number>} */
    let excluded_sections_map = new Map();

    // Insert top-level "before_prompt"
    if (before_prompt) {
      content_to_copy += `${before_prompt}\n`;
    }

    switch (mode) {
      case 'folder': {
        content_to_copy += `${label}:\n${folder_structure}\nFile contents:\n`;
        for (const file of files) {
          file_count++;

          if (final_before_each_prompt) {
            content_to_copy += replace_file_placeholders(final_before_each_prompt, file.path) + '\n';
          }

          const { processed_content, excluded_count, excluded_sections } = await this.#process_file(
            file.path,
            excluded_headings
          );
          total_excluded_sections += excluded_count;
          excluded_sections.forEach((cnt, sec) => {
            excluded_sections_map.set(sec, (excluded_sections_map.get(sec) || 0) + cnt);
          });

          content_to_copy += `\n${processed_content}\n`;

          if (final_after_each_prompt) {
            content_to_copy += replace_file_placeholders(final_after_each_prompt, file.path) + '\n';
          }
        }
        break;
      }

      case 'visible':
      case 'all-open': {
        content_to_copy += `${label}:\n`;
        for (const file of files) {
          file_count++;

          if (final_before_each_prompt) {
            content_to_copy += replace_file_placeholders(final_before_each_prompt, file.path) + '\n';
          }

          const { processed_content, excluded_count, excluded_sections } = await this.#process_file(
            file.path,
            excluded_headings
          );
          total_excluded_sections += excluded_count;
          excluded_sections.forEach((cnt, sec) => {
            excluded_sections_map.set(sec, (excluded_sections_map.get(sec) || 0) + cnt);
          });

          content_to_copy += `\n${processed_content}\n`;

          if (final_after_each_prompt) {
            content_to_copy += replace_file_placeholders(final_after_each_prompt, file.path) + '\n';
          }
        }
        break;
      }

      case 'visible-linked':
      case 'all-open-linked': {
        const initPaths = new Set(initial_files.map((f) => f.path));
        const linked_only = all_files.filter((f) => !initPaths.has(f.path));

        // Process the linked-only files first
        if (linked_only.length > 0) {
          content_to_copy += `Linked files:\n`;
          for (const lf of linked_only) {
            file_count++;

            if (final_before_each_prompt) {
              content_to_copy += replace_file_placeholders(final_before_each_prompt, lf.path) + '\n';
            }

            const { processed_content, excluded_count, excluded_sections } = await this.#process_file(
              lf.path,
              excluded_headings
            );
            total_excluded_sections += excluded_count;
            excluded_sections.forEach((cnt, sec) => {
              excluded_sections_map.set(sec, (excluded_sections_map.get(sec) || 0) + cnt);
            });

            content_to_copy += `\n${processed_content}\n`;

            if (final_after_each_prompt) {
              content_to_copy += replace_file_placeholders(final_after_each_prompt, lf.path) + '\n';
            }
          }
        }

        // Then process the initial (visible/all-open) files
        content_to_copy += `\n${label}:\n`;
        for (const file of initial_files) {
          file_count++;

          if (final_before_each_prompt) {
            content_to_copy += replace_file_placeholders(final_before_each_prompt, file.path) + '\n';
          }

          // Inline embeds for initial files
          const { processed_content, excluded_count, excluded_sections } =
            await this.#process_file_inlined_embeds(file.path, excluded_headings, initPaths);

          total_excluded_sections += excluded_count;
          excluded_sections.forEach((cnt, sec) => {
            excluded_sections_map.set(sec, (excluded_sections_map.get(sec) || 0) + cnt);
          });

          content_to_copy += `\n${processed_content}\n`;

          if (final_after_each_prompt) {
            content_to_copy += replace_file_placeholders(final_after_each_prompt, file.path) + '\n';
          }
        }
        break;
      }

      default: {
        content_to_copy += '(No valid mode selected.)\n';
        break;
      }
    }

    // Insert bottom-level "after_prompt"
    if (after_prompt) {
      content_to_copy += `\n${after_prompt}\n`;
    }

    return {
      context: content_to_copy,
      stats: {
        file_count,
        total_excluded_sections,
        excluded_sections_map,
        char_count: content_to_copy.length,
      },
    };
  }

  /**
   * Basic file read + heading exclusion only.
   * @private
   */
  async #process_file(filePath, excluded_headings) {
    let raw = '';
    try {
      raw = await this.fs.read(filePath, 'utf-8');
    } catch (e) {
      console.warn(`Could not read file: ${filePath}`, e);
    }
    const { processed_content, excluded_count, excluded_sections } = 
      strip_excluded_sections(raw, excluded_headings);
    return { processed_content, excluded_count, excluded_sections };
  }

  /**
   * Read + inline embedded links + remove link-only lines (unless skipping) + exclude headings.
   * @private
   */
  async #process_file_inlined_embeds(filePath, excluded_headings, initPaths) {
    let raw = '';
    try {
      raw = await this.fs.read(filePath, 'utf-8');
    } catch (e) {
      console.warn(`Could not read file: ${filePath}`, e);
    }

    // Inline any ![[embeds]]
    raw = await inline_embedded_links(
      raw,
      filePath,
      (linkText, curPath) => this.fs.get_link_target_path(linkText, curPath),
      async (fp) => {
        try {
          return await this.fs.read(fp, 'utf-8');
        } catch {
          return '';
        }
      },
      excluded_headings,
      () => new Set() // no “current-embeds” knowledge by default
    );

    // Remove lines that are exclusively a link to included file
    raw = remove_included_link_lines(raw, initPaths, (linkText) =>
      this.fs.get_link_target_path(linkText, filePath)
    );

    // Exclude headings
    const { processed_content, excluded_count, excluded_sections } = 
      strip_excluded_sections(raw, excluded_headings);
    return { processed_content, excluded_count, excluded_sections };
  }

  /**
   * Expose a settings config object for use in SmartView or manual rendering.
   * Should use sentence case for the names (Obsidian requires sentence case).
   */
  get settings_config() {
    return {
      excluded_headings: {
        name: 'Excluded headings',
        description: 'Headings to exclude from copied content (one per line).',
        type: 'textarea_array',
      },
      include_file_tree: {
        name: 'Include file tree',
        description: 'If ON, include a file tree in the output.',
        type: 'toggle',
      },
      link_depth: {
        name: 'Link depth',
        description: 'Number of link “hops” to follow for “with linked” commands (0 = no links).',
        type: 'number',
      },
      max_linked_files: {
        name: 'Max linked files',
        description: 'Limit how many linked files are pulled in BFS expansions (0 = no limit).',
        type: 'number',
      },
      before_prompt: {
        name: 'Before prompt (once)',
        description: 'Text inserted at the top of the output.',
        type: 'textarea',
      },
      before_each_prompt: {
        name: 'Before each file',
        description: 'Text inserted before each file’s content.',
        type: 'textarea',
      },
      after_each_prompt: {
        name: 'After each file',
        description: 'Text inserted after each file’s content.',
        type: 'textarea',
      },
      after_prompt: {
        name: 'After prompt (once)',
        description: 'Text inserted at the very bottom of the output.',
        type: 'textarea',
      },
    };
  }
}
