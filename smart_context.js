// smart_context.js
// -------------------------------------------

import { strip_excluded_sections, format_excluded_sections, remove_included_link_lines, inline_embedded_links } from './utils.js';

/**
 * @typedef {Object} BuildContextOptions
 * @property {string} label - Label for the output (e.g. 'Open files contents')
 * @property {string} mode - One of 'folder', 'visible', 'all-open', 'visible-linked', 'all-open-linked'
 * @property {TFile[]} [files] - A list of files (if mode is folder, visible, all-open)
 * @property {TFile[]} [initial_files] - Initial files for linked modes
 * @property {TFile[]} [all_files] - All files including linked
 * @property {string} [folder_structure] - Folder structure string if mode=folder
 * @property {string[]} excluded_headings
 * @property {string} [output_template]
 */

/**
 * @typedef {Object} SmartContextOpts
 * @property {(file:TFile)=>Promise<string>} get_file_contents
 * @property {(linkText:string, currentPath:string)=>string|undefined} resolve_link
 * @property {(path:string)=>TFile|null} get_file_by_path
 * @property {(file:TFile)=>Set<string>} get_embeds_for_file
 * @property {(file:TFile)=>{links:string[], embeds:string[]}} get_links_for_file
 * @property {Object} settings
 */

/**
 * The SmartContext class builds a comprehensive context string from given sets of files.
 * It relies on callbacks passed in from the plugin to handle Obsidian-specific logic:
 * reading files, resolving links, and retrieving linked files.
 * This keeps SmartContext more platform-agnostic and testable.
 */
export class SmartContext {
  /**
   * @param {SmartContextOpts} opts
   */
  constructor(opts) {
    this.get_file_contents = opts.get_file_contents;
    this.resolve_link = opts.resolve_link;
    this.get_file_by_path = opts.get_file_by_path;
    this.get_embeds_for_file = opts.get_embeds_for_file;
    this.get_links_for_file = opts.get_links_for_file;
    this.settings = opts.settings;
  }

  /**
   * @method build_context
   * @description Builds the output string for given mode and files.
   * @param {BuildContextOptions} context_opts
   * @returns {Promise<string>}
   */
  async build_context(context_opts) {
    const { mode, label, folder_structure, excluded_headings, output_template } = context_opts;

    let content_to_copy = '';
    let files_to_process = [];
    let initial_files = new Set();
    let all_files = new Set();

    if (mode === 'folder' || mode === 'visible' || mode === 'all-open') {
      files_to_process = context_opts.files || [];
    } else if (mode === 'visible-linked' || mode === 'all-open-linked') {
      initial_files = new Set(context_opts.initial_files || []);
      all_files = new Set(context_opts.all_files || []);
    }

    // Formatting:
    // folder mode:
    // <folder_name> Folder Structure:
    // <folder_structure>
    // File Contents:
    //
    // visible/all-open:
    // Open files contents:
    //
    // linked variants:
    // Linked files:
    // ...contents...
    //
    // <label>:
    // ...contents...
    //

    let total_excluded_sections = 0;
    let all_excluded_sections = new Map();

    if (mode === 'folder') {
      content_to_copy += `${label}:\n${folder_structure}\nFile contents:\n`;
      for (const file of files_to_process) {
        const processed = await this.process_single_file(file, excluded_headings, null, null);
        total_excluded_sections += processed.excluded_count;
        this.aggregate_exclusions(all_excluded_sections, processed.excluded_sections);

        content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed.content}\n-----------------------\n\n`;
      }
    } else if (mode === 'visible' || mode === 'all-open') {
      content_to_copy += `${label}:\n`;
      for (const file of files_to_process) {
        const processed = await this.process_single_file(file, excluded_headings, null, null);
        total_excluded_sections += processed.excluded_count;
        this.aggregate_exclusions(all_excluded_sections, processed.excluded_sections);

        content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed.content}\n-----------------------\n\n`;
      }
    } else if (mode === 'visible-linked' || mode === 'all-open-linked') {
      // Need to process linked files first (that are not initial or embedded)
      const initial_file_paths = new Set(Array.from(initial_files).map(f => f.path));

      // Determine embedded files map for initial files
      const embedded_files_map = new Map();
      for (const file of initial_files) {
        const embedded_set = this.get_embeds_for_file(file);
        embedded_files_map.set(file.path, embedded_set);
      }

      const is_file_embedded = (file_path) => {
        for (const emb_set of embedded_files_map.values()) {
          if (emb_set.has(file_path)) return true;
        }
        return false;
      };

      const linked_only_files = new Set(
        Array.from(all_files).filter(f => {
          if (initial_file_paths.has(f.path)) return false;
          if (is_file_embedded(f.path)) return false;
          return true;
        })
      );

      if (linked_only_files.size > 0) {
        content_to_copy += `Linked files:\n`;
        for (const file of linked_only_files) {
          const processed = await this.process_single_file(file, excluded_headings, null, null);
          total_excluded_sections += processed.excluded_count;
          this.aggregate_exclusions(all_excluded_sections, processed.excluded_sections);

          content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed.content}\n\n-----------------------\n\n`;
        }
      }

      // Process initial files, with embedded inlining and link line removal
      content_to_copy += `\n${label}:\n`;
      for (const file of initial_files) {
        const file_path = file.path;
        const embedded_set = embedded_files_map.get(file_path) || new Set();

        // We'll inline embeds and remove link-only lines as in main-v1 logic
        const processed = await this.process_single_file(
          file,
          excluded_headings,
          (linkText) => this.resolve_link(linkText, file_path),
          async (filePath) => {
            const f = this.get_file_by_path(filePath);
            return f ? await this.get_file_contents(f) : '';
          },
          embedded_set,
          initial_file_paths
        );

        total_excluded_sections += processed.excluded_count;
        this.aggregate_exclusions(all_excluded_sections, processed.excluded_sections);

        content_to_copy += `----------------------\n/${file.path}\n-----------------------\n${processed.content}\n`;
      }
    }

    if (output_template) {
      content_to_copy = `${output_template}\n${content_to_copy}`;
    }

    // Add notice-like summary in main (already done in main's copyToClipboard)
    // Here we just return the final string
    return content_to_copy;
  }

  aggregate_exclusions(all_excluded_sections, new_exclusions) {
    new_exclusions.forEach((count, section) => {
      all_excluded_sections.set(section, (all_excluded_sections.get(section) || 0) + count);
    });
  }

  /**
   * Process a single file: read contents, strip excluded sections, handle embeddings if provided.
   * @param {TFile} file
   * @param {string[]} excluded_headings
   * @param {(linkText:string)=>string|undefined} link_resolver Optional link resolver for embeddings
   * @param {(filePath:string)=>Promise<string>} file_content_resolver Optional file content resolver for embeddings
   * @param {Set<string>} embedded_set Optional set of embedded file paths
   * @param {Set<string>} included_file_paths Optional set of included files for link removal
   * @returns {Promise<{content:string,excluded_count:number,excluded_sections:Map<string,number>}>}
   */
  async process_single_file(
    file,
    excluded_headings,
    link_resolver = null,
    file_content_resolver = null,
    embedded_set = null,
    included_file_paths = null
  ) {
    let file_content = await this.get_file_contents(file);
    let excluded_count = 0;
    let excluded_sections = new Map();

    // If we have embeddings and link_resolvers, inline them
    if (link_resolver && file_content_resolver && embedded_set) {
      file_content = await inline_embedded_links(
        file_content,
        file.path,
        link_resolver,
        file_content_resolver,
        excluded_headings,
        () => embedded_set
      );
    }

    // If we have included_file_paths, remove link-only lines
    if (included_file_paths && link_resolver) {
      file_content = remove_included_link_lines(
        file_content,
        included_file_paths,
        (linkText) => link_resolver(linkText, file.path)
      );
    }

    // Exclusion processing
    const res = strip_excluded_sections(file_content, excluded_headings);
    excluded_count = res.excluded_count;
    excluded_sections = res.excluded_sections;

    return {
      content: res.processed_content,
      excluded_count,
      excluded_sections
    };
  }
}
