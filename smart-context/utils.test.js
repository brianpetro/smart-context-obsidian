import test from 'ava';
import { 
  strip_excluded_sections, 
  format_excluded_sections, 
  remove_included_link_lines, 
  inline_embedded_links 
} from './utils.js';


// ***** Tests for strip_excluded_sections *****

test('strip_excluded_sections returns original content if no excluded headings', t => {
  const content = `# Heading 1\nSome content\n## Subheading\nMore content\n`;
  const { processed_content, excluded_count, excluded_sections } = strip_excluded_sections(content, []);
  t.is(processed_content.trim(), content.trim());
  t.is(excluded_count, 0);
  t.is(excluded_sections.size, 0);
});

test('strip_excluded_sections excludes section under matching heading', t => {
  const content = `# Secret\nThis should be excluded\n## Another heading\nThis should remain\n`;
  const { processed_content, excluded_count, excluded_sections } = strip_excluded_sections(content, ['Secret']);
  t.is(processed_content.trim(), '## Another heading\nThis should remain');
  t.is(excluded_count, 1);
  t.is(excluded_sections.get('Secret'), 1);
});

test('strip_excluded_sections resumes inclusion at next heading of same or higher level', t => {
  const content = `# Public\nVisible content\n# Secret\nExcluded content\n## Still excluded\n# Public again\nVisible again`;
  const { processed_content } = strip_excluded_sections(content, ['Secret']);
  t.true(processed_content.includes('Visible content'));
  t.false(processed_content.includes('Excluded content'));
  t.false(processed_content.includes('Still excluded'));
  t.true(processed_content.includes('Public again'));
});

test('strip_excluded_sections does not exclude code blocks when heading is excluded', t => {
  const content = `# Secret\n\`\`\`\nCode block should be excluded\n\`\`\`\n# Next\nVisible`;
  const { processed_content } = strip_excluded_sections(content, ['Secret']);
  t.false(processed_content.includes('Code block should be excluded'));
  t.true(processed_content.includes('Visible'));
});

test('strip_excluded_sections does not check headings inside code blocks', t => {
  const content = `\`\`\`\n# Secret heading inside code\n\`\`\`\n# Public\nVisible content`;
  const { processed_content } = strip_excluded_sections(content, ['Secret heading inside code']);
  // Nothing is excluded because heading is in code block
  t.is(processed_content.trim(), content.trim());
});

test('strip_excluded_sections multiple excluded headings', t => {
  const content = `
# Secret
Excluded 1
## Another Secret
Excluded 2
# Public
Visible
`;
  const { processed_content, excluded_count, excluded_sections } = strip_excluded_sections(content, ['Secret', 'Another Secret']);
  t.true(processed_content.includes('Public'));
  t.false(processed_content.includes('Excluded 1'));
  t.false(processed_content.includes('Excluded 2'));
  t.is(excluded_count, 2);
  t.is(excluded_sections.get('Secret'), 1);
  t.is(excluded_sections.get('Another Secret'), 1);
});

test('strip_excluded_sections nested headings', t => {
  const content = `
# Top
Visible line
## Secret
Excluded line
### Deeper
Excluded deeper line
## Another Public
Visible again
`;
  const { processed_content } = strip_excluded_sections(content, ['Secret']);
  t.true(processed_content.includes('Top'));
  t.true(processed_content.includes('Visible line'));
  t.false(processed_content.includes('Excluded line'));
  t.false(processed_content.includes('Excluded deeper line'));
  t.true(processed_content.includes('Another Public'));
});


// ***** Tests for format_excluded_sections *****

test('format_excluded_sections returns empty string for empty map', t => {
  const result = format_excluded_sections(new Map());
  t.is(result, '');
});

test('format_excluded_sections formats single excluded section', t => {
  const map = new Map([['Secret', 1]]);
  const result = format_excluded_sections(map);
  t.true(result.includes('"Secret"'));
  t.false(result.includes('×'));
});

test('format_excluded_sections formats multiple counts', t => {
  const map = new Map([['Secret', 2], ['Another', 1]]);
  const result = format_excluded_sections(map);
  t.true(result.includes('"Secret" (2×)'));
  t.true(result.includes('"Another"'));
});


// ***** Tests for remove_included_link_lines *****

test('remove_included_link_lines removes lines that are only link to included files', t => {
  const content = `
Line before
[[included-file]]
[[excluded-file]]
Line after
`;
  const included_files = new Set(['path/to/included-file']);
  const link_resolver = (linkText) => {
    if (linkText === 'included-file') return 'path/to/included-file';
    if (linkText === 'excluded-file') return 'path/to/excluded-file';
    return undefined;
  };
  
  const processed = remove_included_link_lines(content, included_files, link_resolver);
  t.true(processed.includes('excluded-file'));
  t.false(processed.includes('[[included-file]]'));
  t.true(processed.includes('Line before'));
  t.true(processed.includes('Line after'));
});

test('remove_included_link_lines keeps non-link lines unchanged', t => {
  const content = `
No links here
Just text
[[not-included]]
More text
`;
  const included_files = new Set(['some/path']);
  const link_resolver = () => undefined; // no link resolves
  const processed = remove_included_link_lines(content, included_files, link_resolver);
  t.is(processed, content.trim());
});

test('remove_included_link_lines removes only lines that are exclusively a single included link', t => {
  const content = `
[[included-file]] This line should remain because it has more than a link
[[included-file]]
`;
  const included_files = new Set(['inc-path']);
  const link_resolver = (linkText) => linkText === 'included-file' ? 'inc-path' : undefined;
  const processed = remove_included_link_lines(content, included_files, link_resolver);
  t.true(processed.includes('This line should remain'));
  t.false(processed.includes('[[included-file]]\n'));
});


// ***** Tests for inline_embedded_links *****

test('inline_embedded_links replaces embedded links with their content', async t => {
  const content = `Here is an embed: ![[embedded-file]] and another line.`;
  const current_file_path = 'current.md';
  const link_resolver = (linkText) => linkText === 'embedded-file' ? 'embedded.md' : undefined;
  const file_content_resolver = async (filePath) => {
    if (filePath === 'embedded.md') return '# Embedded Heading\nEmbedded content\n';
    return '';
  };
  const embedded_links_resolver = () => new Set(['embedded.md']);
  
  const processed = await inline_embedded_links(content, current_file_path, link_resolver, file_content_resolver, [], embedded_links_resolver);
  t.false(processed.includes('![[embedded-file]]'));
  t.true(processed.includes('> [!embed] embedded.md'));
  t.true(processed.includes('Embedded content'));
});

test('inline_embedded_links handles non-existent embedded files', async t => {
  const content = `![[missing-file]]`;
  const link_resolver = () => undefined;
  const file_content_resolver = async () => '';
  const embedded_links_resolver = () => new Set();

  const processed = await inline_embedded_links(content, 'current.md', link_resolver, file_content_resolver, [], embedded_links_resolver);
  t.true(processed.includes('Embedded file not found'));
});

test('inline_embedded_links converts embedded link to normal link if not in embedded set', async t => {
  const content = `Here is ![[another-file]].`;
  const link_resolver = (linkText) => linkText === 'another-file' ? 'another.md' : undefined;
  const file_content_resolver = async () => '';
  const embedded_links_resolver = () => new Set(); // no embedded files

  const processed = await inline_embedded_links(content, 'current.md', link_resolver, file_content_resolver, [], embedded_links_resolver);
  // Should just become a normal link: [[another-file]]
  t.false(processed.includes('![[another-file]]'));
  t.true(processed.includes('[[another-file]]'));
});

test('inline_embedded_links applies exclusions to embedded file content', async t => {
  const content = `![[embedded-file]]`;
  const link_resolver = (linkText) => linkText === 'embedded-file' ? 'embedded.md' : undefined;
  const file_content_resolver = async () => '# Secret\nexcluded\n# Public\nincluded';
  const embedded_links_resolver = () => new Set(['embedded.md']);
  
  const processed = await inline_embedded_links(content, 'current.md', link_resolver, file_content_resolver, ['Secret'], embedded_links_resolver);
  t.false(processed.includes('excluded'));
  t.true(processed.includes('included'));
  t.true(processed.includes('> [!embed] embedded.md'));
  t.true(processed.includes('section(s) excluded'));
});

test('inline_embedded_links handles multiple embeds in the same file', async t => {
  const content = `Embed one: ![[file1]]\nEmbed two: ![[file2]]`;
  const link_resolver = (linkText) => {
    if (linkText === 'file1') return 'file1.md';
    if (linkText === 'file2') return 'file2.md';
    return undefined;
  };
  const file_content_resolver = async (filePath) => {
    if (filePath === 'file1.md') return 'Content of file1';
    if (filePath === 'file2.md') return 'Content of file2';
    return '';
  };
  const embedded_links_resolver = () => new Set(['file1.md', 'file2.md']);
  
  const processed = await inline_embedded_links(content, 'current.md', link_resolver, file_content_resolver, [], embedded_links_resolver);
  t.true(processed.includes('> [!embed] file1.md'));
  t.true(processed.includes('Content of file1'));
  t.true(processed.includes('> [!embed] file2.md'));
  t.true(processed.includes('Content of file2'));
});

test('inline_embedded_links preserves whitespace and handles empty content gracefully', async t => {
  const content = `Start\n\n![[empty-file]]\n\nEnd`;
  const link_resolver = () => 'empty.md';
  const file_content_resolver = async () => '';
  const embedded_links_resolver = () => new Set(['empty.md']);

  const processed = await inline_embedded_links(content, 'current.md', link_resolver, file_content_resolver, [], embedded_links_resolver);
  t.true(processed.includes('> [!embed] empty.md'));
  // No content in embedded file, just no error should occur
});

