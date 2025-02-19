/**
 * @file codeblock.js
 * @description Exports a single function, parse_codeblock, which scans a text for
 * ```smart-context code blocks, extracts each line (file or folder path), and returns
 * all absolute file paths. Folders are expanded recursively (respecting .gitignore
 * and .scignore). Uses Node's fs functions directly instead of SmartFs.
 *
 * Usage example:
 *   import { parse_codeblock } from './codeblock.js';
 *   const content = '
 *     Some text
 *     ```smart-context
 *     src/
 *     docs/README.md
 *     ```
 *     more text...
 *   ';
 *   const results = await parse_codeblock(content, '/absolute/base/path');
 *   console.log(results);
 */

import { promises as fs } from 'fs';
import path from 'path';
import { is_text_file, should_ignore } from 'smart-file-system/utils/ignore.js';

/**
 * @typedef {Object} IgnorePatterns
 * @property {string[]} patterns - The array of patterns from .gitignore, .scignore, etc.
 * @property {string[]} matched - The array of matched patterns for reporting.
 */

/**
 * exists_path
 * Checks if a file or folder exists.
 *
 * @param {string} file_path
 * @returns {Promise<boolean>}
 */
async function exists_path(file_path) {
  try {
    await fs.access(file_path);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * list_files_recursive
 * Recursively collects files under a directory, returning objects with relative paths.
 *
 * @param {string} dir_path - Absolute path to directory
 * @param {string[]} ignore_patterns - The array of ignore patterns to apply
 * @param {string[]} [ignored_patterns_matched=[]] - Array to record matched ignore patterns.
 * @returns {Promise<{ path: string }[]>}
 */
async function list_files_recursive(dir_path, ignore_patterns, ignored_patterns_matched = []) {
  const results = [];

  /**
   * walk
   * @param {string} current_path
   */
  async function walk(current_path) {
    const entries = await fs.readdir(current_path, { withFileTypes: true });
    for (const entry of entries) {
      const full_path = path.join(current_path, entry.name);
      const relative_path = path.relative(dir_path, full_path).replace(/\\/g, '/');
      if (should_ignore(relative_path, ignore_patterns, ignored_patterns_matched)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(full_path);
      } else {
        results.push({ path: relative_path });
      }
    }
  }

  await walk(dir_path);
  return results;
}

/**
 * load_ignore_patterns_fs
 * Loads .gitignore and .scignore patterns from the basePath (if present), plus additional excludes.
 *
 * @param {string} base_path
 * @param {string[]} [additional_excludes=[]]
 * @returns {Promise<string[]>} Combined ignore patterns
 */
async function load_ignore_patterns_fs(base_path, additional_excludes = []) {
  let patterns = [];
  for (const ignore_file of ['.gitignore', '.scignore']) {
    const ignore_path = path.join(base_path, ignore_file);
    if (await exists_path(ignore_path)) {
      const content = await fs.readFile(ignore_path, 'utf-8');
      // remove blank lines and comments
      const lines = content
        .split('\n')
        .map(l => l.trim())
        .filter(l => l !== '' && !l.startsWith('#'));
      patterns = patterns.concat(lines);
    }
  }
  if (Array.isArray(additional_excludes)) {
    patterns = patterns.concat(additional_excludes);
  }
  return patterns;
}

/**
 * @typedef {Object} ParseCodeblockOptions
 * @property {boolean} [includeNonText=false] - If true, include non-text files as well.
 * @property {string[]} [additionalExcludes] - Extra glob patterns to exclude.
 */

/**
 * parse_codeblock
 * Scans the input text for ```smart-context code blocks, gathers each line as a path,
 * and expands any directories into contained files. Returns a list of absolute paths
 * to all included files, respecting .gitignore/.scignore patterns.
 *
 * @param {string} fileContent - The entire note or text to scan for code blocks.
 * @param {string} basePath - The absolute base path on the local filesystem.
 * @param {ParseCodeblockOptions} [options={}] - Additional options for ignoring or including files.
 * @returns {Promise<{ items: Object<string, { path: string, content: string, char_count: number }>, ignored_patterns_matched: string[], external_chars: number }>}
 */
export async function parse_codeblock(fileContent, basePath, options = {}) {
  const { includeNonText = false, additionalExcludes = [] } = options;
  // Load ignore patterns from the base directory (including additional excludes)
  const ignore_patterns = await load_ignore_patterns_fs(basePath, additionalExcludes);
  console.log('basePath', basePath);
  const code_block_regex = /```smart-context([\s\S]*?)```/g;
  let match;
  const all_paths = [];
  const ignored_patterns_matched = [];

  while ((match = code_block_regex.exec(fileContent)) !== null) {
    // match[1] => contents inside ```smart-context ... ```
    const lines = match[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => l !== '');

    for (const line of lines) {
      const abs_path = path.join(basePath, line);
      console.log('absPath', abs_path);

      const file_exists = await exists_path(abs_path);
      if (!file_exists) {
        console.log('not found', abs_path);
        continue;
      }

      const stats = await fs.stat(abs_path);
      console.log('stats', stats);

      if (stats.isDirectory()) {
        console.log('isDirectory', abs_path);
        // Load local ignore patterns (including additional excludes) from the directory
        const local_ignore_patterns = await load_ignore_patterns_fs(abs_path, additionalExcludes);
        // Use the local ignore patterns for directory expansion
        const effective_ignore_patterns = local_ignore_patterns;
        const files = await list_files_recursive(abs_path, effective_ignore_patterns, ignored_patterns_matched);
        for (const f_obj of files) {
          // f_obj.path is relative to abs_path, so join with abs_path
          const full_path = path.join(abs_path, f_obj.path).replace(/\\/g, '/');
          if (includeNonText || is_text_file(full_path, path.sep)) {
            all_paths.push(full_path);
          }
        }
      } else {
        console.log('isFile', abs_path);
        // Check if an explicit file is ignored based on the base directory patterns
        const relative_path = path.relative(basePath, abs_path).replace(/\\/g, '/');
        if (should_ignore(relative_path, ignore_patterns, ignored_patterns_matched)) {
          console.log('file ignored by ignore patterns', abs_path);
          continue;
        }
        if (includeNonText || is_text_file(abs_path, path.sep)) {
          all_paths.push(abs_path.replace(/\\/g, '/'));
        }
      }
    }
  }

  // deduplicate results
  const unique_paths = [...new Set(all_paths)];
  const items = {};
  let external_chars = 0;

  for (const ext_path of unique_paths) {
    const content = await fs.readFile(ext_path, 'utf-8');
    items[ext_path] = {
      path: ext_path,
      content: content,
      char_count: content.length
    };
    external_chars += content.length;
  }

  return { items, ignored_patterns_matched, external_chars };
}
