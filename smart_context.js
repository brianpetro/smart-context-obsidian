/**
 * @file smart_context_module.js
 * @description
 * Exports a `SmartContext` class that can be instantiated with:
 *   new SmartContext({
 *     fs,                      // Your SmartFs (or compatible) instance
 *     get_links_for_path,      // (filePath: string) => { links: string[], embeds: string[] }
 *     get_embeds_for_path,     // (filePath: string) => Set<string>
 *     resolve_link,            // (linkText: string, currentPath: string) => string|undefined
 *     excluded_headings,       // string[] of headings to exclude
 *     output_template          // optional text template to prepend
 *   });
 *
 * Then call `.build_context(context_opts)`, where `context_opts` includes:
 *   - mode: 'folder' | 'visible' | 'all-open' | 'visible-linked' | 'all-open-linked'
 *   - label: string
 *   - files?:        array of { path: string }
 *   - initial_files?: array of { path: string }
 *   - all_files?:     array of { path: string }
 *   - folder_structure?: string  (when mode='folder')
 *   - excluded_headings?: string[]
 *   - output_template?: string
 * 
 * This yields a final string containing the aggregated content with excluded
 * headings removed, embedded files inlined (if applicable), etc.
 */

import {
  strip_excluded_sections,
  remove_included_link_lines,
  inline_embedded_links
} from './utils.js';  // Re-use your existing utility logic

export class SmartContext {
  /**
   * @param {Object} opts
   * @param {Object} opts.fs - A SmartFs or similar object with .read(filePath, encoding)
   * @param {(filePath: string) => { links: string[], embeds: string[] }} opts.get_links_for_path
   * @param {(filePath: string) => Set<string>} opts.get_embeds_for_path
   * @param {(linkText: string, currentPath: string) => string|undefined} opts.resolve_link
   * @param {string[]} [opts.excluded_headings=[]]
   * @param {string} [opts.output_template='']
   */
  constructor(opts) {
    this.fs = opts.fs;
    this.get_links_for_path = opts.get_links_for_path;
    this.get_embeds_for_path = opts.get_embeds_for_path;
    this.resolve_link = opts.resolve_link;
    this.default_excluded_headings = opts.excluded_headings || [];
    this.default_output_template = opts.output_template || '';
  }

  /**
   * @typedef {Object} BuildContextOptions
   * @property {string} mode - 'folder' | 'visible' | 'all-open' | 'visible-linked' | 'all-open-linked'
   * @property {string} label
   * @property {string} [folder_structure]
   * @property {{path:string}[]} [files]
   * @property {{path:string}[]} [initial_files]
   * @property {{path:string}[]} [all_files]
   * @property {string[]} [excluded_headings]
   * @property {string} [output_template]
   */

  /**
   * Constructs a final string with file contents (and optional linking).
   * @param {BuildContextOptions} context_opts
   * @returns {Promise<string>}
   */
  async build_context(context_opts) {
    const {
      mode,
      label,
      folder_structure = '',
      files = [],
      initial_files = [],
      all_files = [],
      excluded_headings = this.default_excluded_headings,
      output_template = this.default_output_template
    } = context_opts;

    let content_to_copy = '';
    let total_excluded_sections = 0;
    const all_excluded_map = new Map();

    // 1) Handle simpler modes
    if (mode === 'folder') {
      content_to_copy += `${label}:\n${folder_structure}\nFile contents:\n`;
      for (const file of files) {
        const processed = await this.#process_single_file(file.path, excluded_headings);
        total_excluded_sections += processed.excluded_count;
        this.#aggregate_exclusions(all_excluded_map, processed.excluded_sections);

        content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed.content}\n-----------------------\n\n`;
      }
    }
    else if (mode === 'visible' || mode === 'all-open') {
      content_to_copy += `${label}:\n`;
      for (const file of files) {
        const processed = await this.#process_single_file(file.path, excluded_headings);
        total_excluded_sections += processed.excluded_count;
        this.#aggregate_exclusions(all_excluded_map, processed.excluded_sections);

        content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed.content}\n-----------------------\n\n`;
      }
    }
    // 2) Handle linked modes
    else if (mode === 'visible-linked' || mode === 'all-open-linked') {
      const initPaths = new Set(initial_files.map(f => f.path));

      // Build map: filePath => setOfEmbeddedFilePaths
      const embedded_map = new Map();
      for (const f of initial_files) {
        const embedSet = this.get_embeds_for_path(f.path);
        embedded_map.set(f.path, embedSet || new Set());
      }
      const isEmbedded = (filePath) => {
        for (const s of embedded_map.values()) {
          if (s.has(filePath)) return true;
        }
        return false;
      };

      // Linked-only files: in all_files but not initial, not embedded
      const linked_only_files = all_files.filter(f => {
        if (initPaths.has(f.path)) return false;
        if (isEmbedded(f.path)) return false;
        return true;
      });
      if (linked_only_files.length > 0) {
        content_to_copy += `Linked files:\n`;
        for (const lf of linked_only_files) {
          const processed = await this.#process_single_file(lf.path, excluded_headings);
          total_excluded_sections += processed.excluded_count;
          this.#aggregate_exclusions(all_excluded_map, processed.excluded_sections);

          content_to_copy += `----------------------\n/${lf.path}\n-----------------------\n${processed.content}\n\n-----------------------\n\n`;
        }
      }

      // Now, initial files, with embedded expansions
      content_to_copy += `\n${label}:\n`;
      for (const f of initial_files) {
        const embedded_set = embedded_map.get(f.path) || new Set();
        const processed = await this.#process_single_file_with_embeddings(
          f.path,
          excluded_headings,
          initPaths,
          embedded_set
        );
        total_excluded_sections += processed.excluded_count;
        this.#aggregate_exclusions(all_excluded_map, processed.excluded_sections);

        content_to_copy += `----------------------\n/${f.path}\n-----------------------\n${processed.content}\n`;
      }
    }

    // 3) Insert user’s output_template
    if (output_template) {
      content_to_copy = `${output_template}\n${content_to_copy}`;
    }

    // (Optional) Could do something with total_excluded_sections or all_excluded_map
    return content_to_copy;
  }

  /**
   * Helper to accumulate excluded sections into a global map.
   * @param {Map<string, number>} targetMap
   * @param {Map<string, number>} newExclusions
   */
  #aggregate_exclusions(targetMap, newExclusions) {
    for (const [section, count] of newExclusions.entries()) {
      targetMap.set(section, (targetMap.get(section) || 0) + count);
    }
  }

  /**
   * Reads a file, strips excluded headings.
   * @param {string} filePath
   * @param {string[]} excluded
   */
  async #process_single_file(filePath, excluded) {
    let rawContent = '';
    try {
      rawContent = await this.fs.read(filePath, 'utf-8');
    } catch (e) {
      // Handle read error or just keep empty
      rawContent = '';
    }
    const { processed_content, excluded_count, excluded_sections } =
      strip_excluded_sections(rawContent, excluded);
    return {
      content: processed_content,
      excluded_count,
      excluded_sections
    };
  }

  /**
   * Reads a file, inlines embedded content if in `embedded_set`, removes link-only lines for any `initPaths`.
   * Then strips excluded headings.
   * @param {string} filePath
   * @param {string[]} excluded
   * @param {Set<string>} initPaths
   * @param {Set<string>} embedded_set
   */
  async #process_single_file_with_embeddings(filePath, excluded, initPaths, embedded_set) {
    let rawContent = '';
    try {
      rawContent = await this.fs.read(filePath, 'utf-8');
    } catch (e) {
      rawContent = '';
    }

    // 1) Inline embedded links
    rawContent = await inline_embedded_links(
      rawContent,
      filePath,
      this.resolve_link,
      async (fp) => {
        try { return await this.fs.read(fp, 'utf-8'); }
        catch(e) { return ''; }
      },
      excluded,
      () => embedded_set
    );

    // 2) Remove lines that only link to included files
    if (initPaths && this.resolve_link) {
      rawContent = remove_included_link_lines(
        rawContent,
        initPaths,
        (linkText) => this.resolve_link(linkText, filePath)
      );
    }

    // 3) Exclude headings
    const { processed_content, excluded_count, excluded_sections } =
      strip_excluded_sections(rawContent, excluded);

    return {
      content: processed_content,
      excluded_count,
      excluded_sections
    };
  }
}
