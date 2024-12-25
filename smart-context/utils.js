/**
 * Strip excluded sections from file content.
 * @param {string} content - Raw file content
 * @param {string[]} excluded_headings - List of heading texts to exclude
 * @returns {{processed_content: string, excluded_count: number, excluded_sections: Map<string, number>}}
 */
export function strip_excluded_sections(content, excluded_headings) {
  if (!excluded_headings || excluded_headings.length === 0) {
    return {
      processed_content: content,
      excluded_count: 0,
      excluded_sections: new Map(),
    };
  }

  const lines = content.split('\n');
  let result = [];
  let exclude_mode = false;
  let exclude_level = null;
  let excluded_count = 0;
  let excluded_sections = new Map();
  let current_excluded_heading = null;

  let in_code_block = false;
  let code_block_marker = '';

  // Enhanced fence regex to handle language tags and ~
  const fence_regex = /^(\s*)(`{3,}|~{3,})(.*)$/;

  for (let line of lines) {
    const fence_match = line.match(fence_regex);
    if (fence_match) {
      const fence_symbol = fence_match[2]; // e.g. ``` or ~~~
      if (!in_code_block) {
        // Enter code block
        in_code_block = true;
        code_block_marker = fence_symbol; // store the exact symbol used
      } else {
        // Possibly exiting if it matches the same length of fence
        // or if it's at least as many backticks/tilde as opening
        if (fence_symbol.length >= code_block_marker.length) {
          // exit code block
          in_code_block = false;
          code_block_marker = '';
        }
      }
      if (!exclude_mode) {
        result.push(line);
      }
      continue;
    }

    if (in_code_block) {
      if (!exclude_mode) {
        result.push(line);
      }
      continue;
    }

    // Attempt to match a heading: e.g. "## Heading"
    // We'll do a flexible match for "starts with #"
    const heading_match = line.match(/^(#+)\s+(.*)$/);
    if (heading_match) {
      const hashes = heading_match[1];
      const heading_text = heading_match[2].trim();

      // If heading_text "starts with" or "equals" an excluded heading (case-insensitive)
      const matched_exclusion = is_excluded_heading(heading_text, excluded_headings);

      if (matched_exclusion) {
        excluded_count++;
        current_excluded_heading = matched_exclusion;
        excluded_sections.set(
          current_excluded_heading,
          (excluded_sections.get(current_excluded_heading) || 0) + 1
        );
        exclude_mode = true;
        exclude_level = hashes.length;
        continue;
      }

      // If we were excluding, check if this heading ends exclusion
      if (exclude_mode) {
        const current_level = hashes.length;
        if (current_level <= exclude_level) {
          exclude_mode = false;
          exclude_level = null;
          current_excluded_heading = null;
          result.push(line);
        }
      } else {
        result.push(line);
      }
    } else {
      if (!exclude_mode) {
        result.push(line);
      }
    }
  }

  return {
    processed_content: result.join('\n'),
    excluded_count,
    excluded_sections,
  };
}

/**
 * We treat an excluded heading as any heading that "starts with" the given text,
 * ignoring case. If matched, we return the actual excluded heading from the user
 * config (for logging) or at least a normalized version.
 */
function is_excluded_heading(heading_text, excluded_headings) {
  const lower_line = heading_text.toLowerCase();
  for (const h of excluded_headings) {
    const lower_excl = h.trim().toLowerCase();
    // "starts with" check
    if (lower_line.startsWith(lower_excl)) {
      return h; // return the raw heading from config
    }
  }
  return null;
}

/**
 * Format excluded sections for notification.
 * @param {Map<string, number>} excluded_sections - Map of section names to count
 * @returns {string} Formatted string for notification
 */
export function format_excluded_sections(excluded_sections) {
  if (excluded_sections.size === 0) return '';

  const sections = Array.from(excluded_sections.entries())
    .map(([section, count]) =>
      count === 1 ? `  • "${section}"` : `  • "${section}" (${count}×)`
    )
    .join('\n');

  return `:\n${sections}`;
}

/**
 * Remove lines that only contain links to included files (including optional bullet).
 * @param {string} content - Raw file content
 * @param {Set<string>} included_file_paths - Set of included file paths
 * @param {(linkText: string) => string|undefined} link_resolver - Function to resolve link text to file path
 * @returns {string} Processed content
 */
export function remove_included_link_lines(content, included_file_paths, link_resolver) {
  const lines = content.split('\n');
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();

    // Check a pattern that allows optional bullet, e.g. "- [[something]]"
    if (/^[-*+]?\s*\[\[[^\]]+\]\]\s*$/.test(trimmed)) {
      const link_text = trimmed.replace(/^[-*+]\s*/, '') // strip bullet if present
        .slice(2, -2)
        .split('|')[0]
        .trim();
      const resolved_path = link_resolver(link_text);
      if (resolved_path && included_file_paths.has(resolved_path)) {
        return false;
      }
    }
    return true;
  });

  return filtered.join('\n');
}

/**
 * Process embedded links in content.
 * We gather all ![[...]] matches, then replace them in one pass to avoid reprocessing issues.
 *
 * @param {string} content
 * @param {string} current_file_path
 * @param {(linkText: string, currentPath: string) => string|undefined} link_resolver 
 * @param {(filePath: string) => Promise<string>} file_content_resolver 
 * @param {string[]} excluded_headings 
 * @param {(filePath: string) => Set<string>} embedded_links_resolver 
 * @returns {Promise<string>}
 */
export async function inline_embedded_links(
  content,
  current_file_path,
  link_resolver,
  file_content_resolver,
  excluded_headings,
  embedded_links_resolver
) {
  const embedded_link_regex = /!\[\[([^\]]+)\]\]/g;
  
  const matches = [];
  let match;
  while ((match = embedded_link_regex.exec(content)) !== null) {
    matches.push({
      full: match[0],     
      inner: match[1],    
      index: match.index  
    });
  }

  if (!matches.length) {
    return content; 
  }

  const segments = [];
  let lastIndex = 0;

  const current_embedded = embedded_links_resolver(current_file_path) || new Set();

  for (const m of matches) {
    if (m.index > lastIndex) {
      segments.push(content.slice(lastIndex, m.index));
    }
    lastIndex = m.index + m.full.length;

    const link_text = m.inner.split('|')[0].trim();
    const linked_file_path = link_resolver(link_text, current_file_path);

    if (!linked_file_path) {
      segments.push(
        `> [!embed] Embedded file not found\n> "${link_text}" could not be found`
      );
      continue;
    }

    if (current_embedded.has(linked_file_path)) {
      const linked_content_raw = await file_content_resolver(linked_file_path);
      const { processed_content, excluded_count, excluded_sections } = 
        strip_excluded_sections(linked_content_raw, excluded_headings);

      const formatted_content = processed_content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => `> ${line}`)
        .join('\n');

      let exclusion_info = '';
      if (excluded_count > 0) {
        exclusion_info =
          `\n> [!info] ${excluded_count} section(s) excluded` +
          format_excluded_sections(excluded_sections)
            .replace(/\n/g, '\n> ');
      }

      segments.push(
        `> [!embed] ${linked_file_path}${exclusion_info}\n${formatted_content}`
      );
    } else {
      // Convert to a normal link
      segments.push(`[[${link_text}]]`);
    }
  }

  if (lastIndex < content.length) {
    segments.push(content.slice(lastIndex));
  }

  return segments.join('');
}
