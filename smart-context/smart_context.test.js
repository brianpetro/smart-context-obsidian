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
  t.true(output.context.includes('Test Folder Output'), 'Should include label');
  t.true(output.context.includes('Regular content only'), 'file2 content included');
  t.false(output.context.includes('Should be excluded'), 'excluded heading content removed');
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
  t.true(output.context.includes('/someNote.md'), 'Uses only someNote.md');
  t.false(output.context.includes('anotherNote.md'), 'anotherNote not included');
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
  t.false(output.context.includes('excluded A'), 'Excludes from fileA');
  t.false(output.context.includes('excluded B'), 'Excludes from fileB');
  t.true(output.context.includes('remain A'), 'Retains other heading content from fileA');
  t.true(output.context.includes('remain B'), 'Retains other heading content from fileB');
});


test('Given an unknown mode, Then returns fallback text and zero file stats', async (t) => {
  // Given
  const files = {
    'dummy.md': `# Just a dummy file`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({ fs });

  // When
  const { context: output, stats } = await context.build_context({
    mode: 'non-existent-mode',
    files: [{ path: 'dummy.md' }],
  });

  // Then
  t.true(output.context.includes('(No valid mode selected.)'), 'Fallback message should appear');
  t.is(stats.file_count, 0, 'No files processed for unknown mode');
});

test('Given all-open-linked mode, When link_depth=2, Then BFS includes transitive links up to 2 hops', async (t) => {
  // Given
  const files = {
    'noteA.md': `[[noteB]]\n[[noteC]]`,
    'noteB.md': `[[noteD]]\n# Secret\nexcluded B`,
    'noteC.md': `No links here`,
    'noteD.md': `# Title D\nSome D content`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({
    fs,
    excluded_headings: ['Secret'],
    // link_depth set in test options
  });

  // When
  const { context: output, stats } = await context.build_context({
    mode: 'all-open-linked',
    label: 'All open linked',
    // noteA is open; we'll pretend it is the only open file
    initial_files: [{ path: 'noteA.md' }],
    all_files: [
      { path: 'noteA.md' },
      { path: 'noteB.md' },
      { path: 'noteC.md' },
      { path: 'noteD.md' },
    ],
    active_file_path: 'noteA.md',
    link_depth: 2,
  });

  // Then
  // BFS from noteA with depth=2 will pull in noteB, noteC, and also noteD (since B -> D).
  // - noteB has "Secret" heading, so that should be excluded
  t.true(output.context.includes('noteB.md'), 'noteB should be included via BFS hop=1');
  t.true(output.context.includes('noteC.md'), 'noteC should be included via BFS hop=1');
  t.true(output.context.includes('noteD.md'), 'noteD should be included via BFS hop=2');
  t.false(output.context.includes('excluded B'), 'excluded heading from noteB not included');
  t.true(output.context.includes('Some D content'), 'noteD content included');
  t.is(stats.file_count, 4, 'All 4 notes are included in final stats');
});

test('Given skip_exclude_links_in_active_file, When multiple notes contain link-only lines, Then only active note retains them', async (t) => {
  // Given
  const files = {
    'active.md': `[[keepMe]]\nHello from active`,
    'other.md': `[[removeMe]]\nHello from other`,
    'keepMe.md': `Kept content`,
    'removeMe.md': `Removed content`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({
    fs,
    skip_exclude_links_in_active_file: true,
  });

  // When
  const { context: output, stats } = await context.build_context({
    mode: 'all-open-linked',
    label: 'Testing skip exclude in only active',
    initial_files: [{ path: 'active.md' }, { path: 'other.md' }],
    all_files: [
      { path: 'active.md' },
      { path: 'other.md' },
      { path: 'keepMe.md' },
      { path: 'removeMe.md' },
    ],
    active_file_path: 'active.md',
    link_depth: 1,
  });

  // Then
  // The "[[keepMe]]" line remains in active.md. But "[[removeMe]]" in other.md is removed
  // because skip_exclude_links_in_active_file only applies to the active note.
  t.true(output.context.includes('[[keepMe]]'), 'Active note retains link-only line');
  t.false(output.context.includes('[[removeMe]]'), 'Non-active note has link-only line removed');
  t.true(output.context.includes('Hello from active'), 'Active note content remains');
  t.true(output.context.includes('Hello from other'), 'Other note text remains (minus the link-only line)');
  t.is(stats.file_count, 4, 'All 4 files included in final output');
});