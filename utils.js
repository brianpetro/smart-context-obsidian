/**
 * Core business logic for processing content in Smart Context plugin.
 * These functions are platform-agnostic and do not depend on Obsidian APIs.
 */

// EXAMPLE: Turn this on if you want partial or case-insensitive matches
const CASE_INSENSITIVE_MATCH = false;
const PARTIAL_MATCH = false;

/**
 * Check if a heading_text matches any in excluded_headings.
 * By default uses strict equality. If partial/case-insensitive is desired,
 * set the above constants to `true`.
 */
function is_excluded_heading(heading_text, excluded_headings) {
    return !!excluded_headings.find(h => {
        if (CASE_INSENSITIVE_MATCH) {
            const headingLower = heading_text.toLowerCase();
            const excludeLower = h.toLowerCase();
            return PARTIAL_MATCH
              ? headingLower.includes(excludeLower)
              : headingLower === excludeLower;
        } else {
            return PARTIAL_MATCH
              ? heading_text.includes(h)
              : heading_text === h;
        }
    });
}

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
            excluded_sections: new Map()
        };
    }

    const lines = content.split('\n');
    let result = [];
    let exclude_mode = false;
    let exclude_level = null;
    let excluded_count = 0;
    let in_code_block = false;
    let code_block_marker = '';
    let excluded_sections = new Map();
    let current_excluded_heading = null;

    for (let line of lines) {
        // Check for code block start/end
        const code_block_match = line.trim().match(/^(`{3,}|~{3,})/);
        if (code_block_match) {
            if (!in_code_block) {
                in_code_block = true;
                code_block_marker = code_block_match[1];
            } else if (line.trim().startsWith(code_block_marker)) {
                in_code_block = false;
                code_block_marker = '';
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

        // Check if line is a heading
        const heading_match = line.match(/^(#+)\s+(.*)$/);
        if (heading_match) {
            const hashes = heading_match[1];
            const heading_text = heading_match[2].trim();

            // Determine if heading is in the excluded list
            if (is_excluded_heading(heading_text, excluded_headings)) {
                // Start exclusion mode
                excluded_count++;
                current_excluded_heading = heading_text;
                excluded_sections.set(
                    current_excluded_heading,
                    (excluded_sections.get(current_excluded_heading) || 0) + 1
                );
                exclude_mode = true;
                exclude_level = hashes.length;
                continue;
            }

            // If we are currently excluding, check if this heading ends the exclusion
            if (exclude_mode) {
                const current_level = hashes.length;
                if (current_level <= exclude_level) {
                    // End exclusion mode
                    exclude_mode = false;
                    exclude_level = null;
                    current_excluded_heading = null;
                    // This heading is outside excluded section, include it
                    result.push(line);
                }
                // else do not push
            } else {
                // Not excluding currently, just add line
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
        excluded_sections
    };
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
 * Remove lines that only contain links to included files.
 * @param {string} content - Raw file content
 * @param {Set<string>} included_file_paths - Set of included file paths
 * @param {(linkText: string) => string|undefined} link_resolver - Function to resolve link text to file path
 * @returns {string} Processed content with link-only lines removed
 */
export function remove_included_link_lines(content, included_file_paths, link_resolver) {
    const lines = content.split('\n');
    const filtered = lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('[[') || !trimmed.endsWith(']]')) {
            return true;
        }

        const link_text = trimmed.slice(2, -2).split('|')[0].trim();
        const resolved_path = link_resolver(link_text);
        // If resolved to an included file, remove line
        return !resolved_path || !included_file_paths.has(resolved_path);
    });

    return filtered.join('\n');
}

/**
 * Process embedded links in content.
 * We first collect all embed markers, then replace them in one pass
 * to avoid conflicts with repeated `result.replace(...)`.
 *
 * @param {string} content - Raw file content
 * @param {string} current_file_path - Path of current file
 * @param {(linkText: string, currentPath: string) => string|undefined} link_resolver 
 * @param {(filePath: string) => Promise<string>} file_content_resolver 
 * @param {string[]} excluded_headings 
 * @param {(filePath: string) => Set<string>} embedded_links_resolver 
 * @returns {Promise<string>} Processed content with embedded links inlined
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
    
    // Gather up all the matches first
    const matches = [];
    let match;
    while ((match = embedded_link_regex.exec(content)) !== null) {
        matches.push({
            full: match[0],     // "![[something]]"
            inner: match[1],    // "something"
            index: match.index  // position in content
        });
    }

    if (!matches.length) {
        return content; // no embedded links
    }

    // We'll rebuild the output in segments
    const segments = [];
    let lastIndex = 0;

    // For embedded links, check if they belong to `current_embedded`
    const current_embedded = embedded_links_resolver(current_file_path) || new Set();

    for (const m of matches) {
        // push everything before this match
        if (m.index > lastIndex) {
            segments.push(content.slice(lastIndex, m.index));
        }
        lastIndex = m.index + m.full.length;

        const link_text = m.inner.split('|')[0].trim();
        const linked_file_path = link_resolver(link_text, current_file_path);

        if (!linked_file_path) {
            // File not found
            segments.push(
              `> [!embed] Embedded file not found\n> "${link_text}" could not be found`
            );
            continue;
        }

        if (current_embedded.has(linked_file_path)) {
            // inline its content
            const linked_content_raw = await file_content_resolver(linked_file_path);
            const { processed_content, excluded_count, excluded_sections } = 
                strip_excluded_sections(linked_content_raw, excluded_headings);

            const formatted_content = processed_content
                .split('\n')
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

    // push the remainder
    if (lastIndex < content.length) {
        segments.push(content.slice(lastIndex));
    }

    return segments.join('');
}
