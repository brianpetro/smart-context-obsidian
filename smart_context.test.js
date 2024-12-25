import test from 'ava';
import { SmartContext } from './smart_context.js'; // Adjust path if needed

/**
 * Mock in-memory SmartFs-like adapter.
 * - Expects `files` as a dictionary of path->string content.
 */
class InMemoryFs {
  constructor(files = {}) {
    this.files = files; // e.g. { "folder/file1.md": "#Secret\nExclude me\n", ... }
  }

  async read(filePath, encoding = 'utf-8') {
    if (!this.files.hasOwnProperty(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return this.files[filePath];
  }

  get_link_target_path(linkText, currentFilePath) {
    // Basic linkText -> file path resolution
    // e.g. "someNote" => "someNote.md" if it exists in `files`
    // For these tests, we can just do a naive approach:
    const tryPath = linkText.endsWith('.md') ? linkText : linkText + '.md';
    return this.files.hasOwnProperty(tryPath) ? tryPath : undefined;
  }
}

/** 
 * Test suite for SmartContext
 * 
 * We illustrate four sample tests:
 * 1) folder mode with excluded headings
 * 2) visible mode merges only specified files
 * 3) skip_exclude_links_in_active_file = true
 * 4) ignoring an undefined mode
 */

test('Given folder mode, When multiple files exist, Then merges them & excludes specified headings', async (t) => {
  // Given
  const files = {
    'folder/file1.md': `# Title\nSome text\n# Secret\nShould be excluded\n`,
    'folder/file2.md': `Regular content only`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({
    fs,
    excluded_headings: ['Secret'],
  });

  // When
  const output = await context.build_context({
    mode: 'folder',
    label: 'Test Folder Output',
    folder_structure: '├─ file1.md\n└─ file2.md\n',
    files: [
      { path: 'folder/file1.md' },
      { path: 'folder/file2.md' },
    ],
    excluded_headings: ['Secret'],
  });

  // Then
  t.true(output.includes('Test Folder Output'), 'Should include label');
  t.true(output.includes('Regular content only'), 'file2 content included');
  t.false(output.includes('Should be excluded'), 'excluded heading content removed');
});

test('Given visible mode, When files are specified, Then only merges those files', async (t) => {
  // Given
  const files = {
    'someNote.md': `# Visible\nHello world\n`,
    'anotherNote.md': `# Not used\nThis won't appear`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({ fs });

  // When
  const output = await context.build_context({
    mode: 'visible',
    label: 'Open files contents',
    files: [{ path: 'someNote.md' }],
  });

  // Then
  t.true(output.includes('/someNote.md'), 'Uses only someNote.md');
  t.false(output.includes('anotherNote.md'), 'anotherNote not included');
});

test('Given skip_exclude_links_in_active_file, When building context with link-only lines, Then link lines remain in active note', async (t) => {
  // Given
  const files = {
    'activeFile.md': `[[linkedNote]]\n`,
    'linkedNote.md': `Some content`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({
    fs,
    // no excluded headings for this test
    skip_exclude_links_in_active_file: true,
  });

  // When
  const output = await context.build_context({
    mode: 'visible-linked',
    label: 'Active file + linked',
    initial_files: [{ path: 'activeFile.md' }],
    all_files: [
      { path: 'activeFile.md' },
      { path: 'linkedNote.md' },
    ],
    active_file_path: 'activeFile.md', // triggers skip link removal
  });

  // Then
  t.true(output.includes('[[linkedNote]]'), 'Link-only line remains in activeFile');
  t.true(output.includes('linkedNote.md'), 'Linked file is included as well');
});

test('Given excluded_headings, When they appear in multiple files, Then each is stripped accordingly', async (t) => {
  // Given
  const files = {
    'fileA.md': `# Secret\nexcluded A\n# Keep\nremain A`,
    'fileB.md': `## Secret\nexcluded B\n## AlsoKeep\nremain B`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({
    fs,
    excluded_headings: ['Secret'],
  });

  // When
  const output = await context.build_context({
    mode: 'all-open',
    label: 'All open files',
    files: [
      { path: 'fileA.md' },
      { path: 'fileB.md' },
    ],
    excluded_headings: ['Secret'],
  });

  // Then
  t.false(output.includes('excluded A'), 'Excludes from fileA');
  t.false(output.includes('excluded B'), 'Excludes from fileB');
  t.true(output.includes('remain A'), 'Retains other heading content from fileA');
  t.true(output.includes('remain B'), 'Retains other heading content from fileB');
});
