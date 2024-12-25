import test from 'ava';
import { SmartContext } from './smart_context.js';

/**
 * Mock in-memory SmartFs-like adapter.
 * - Expects `files` as a dictionary of path->string content.
 */
class InMemoryFs {
  constructor(files = {}) {
    this.files = files; 
  }

  async read(filePath, encoding = 'utf-8') {
    if (!this.files.hasOwnProperty(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return this.files[filePath];
  }

  get_link_target_path(linkText, currentFilePath) {
    const tryPath = linkText.endsWith('.md') ? linkText : linkText + '.md';
    return this.files.hasOwnProperty(tryPath) ? tryPath : undefined;
  }
}

test('Given folder mode, When multiple files exist, Then merges them & excludes specified headings', async (t) => {
  // Given
  const files = {
    'folder/file1.md': `# Title\nSome text\n# Secret\nShould be excluded\n`,
    'folder/file2.md': `Regular content only`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({
    fs,
    settings: {
      excluded_headings: ['Secret'],
      before_prompt: '',
      before_each_prompt: '',
      after_each_prompt: '',
      after_prompt: '',
      link_depth: 0,
      max_linked_files: 0,
    },
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
  const files = {
    'someNote.md': `# Visible\nHello world\n`,
    'anotherNote.md': `# Not used\nThis won't appear`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({
    fs,
    settings: {
      excluded_headings: [],
      before_prompt: '',
      before_each_prompt: '',
      after_each_prompt: '',
      after_prompt: '',
      link_depth: 0,
      max_linked_files: 0,
    },
  });

  const output = await context.build_context({
    mode: 'visible',
    label: 'Open files contents',
    files: [{ path: 'someNote.md' }],
  });

  t.true(output.context.includes('<context path="someNote.md">'), 'Uses only someNote.md');
  t.false(output.context.includes('<context path="anotherNote.md">'), 'anotherNote not included');
});

test('Given excluded_headings, When they appear in multiple files, Then each is stripped accordingly', async (t) => {
  const files = {
    'fileA.md': `# Secret\nexcluded A\n# Keep\nremain A`,
    'fileB.md': `## Secret\nexcluded B\n## AlsoKeep\nremain B`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({
    fs,
    settings: {
      excluded_headings: ['Secret'],
      before_prompt: '',
      before_each_prompt: '',
      after_each_prompt: '',
      after_prompt: '',
      link_depth: 0,
      max_linked_files: 0,
    },
  });

  const output = await context.build_context({
    mode: 'all-open',
    label: 'All open files',
    files: [
      { path: 'fileA.md' },
      { path: 'fileB.md' },
    ],
    excluded_headings: ['Secret'],
  });

  t.false(output.context.includes('excluded A'), 'Excludes from fileA');
  t.false(output.context.includes('excluded B'), 'Excludes from fileB');
  t.true(output.context.includes('remain A'), 'Retains other heading content from fileA');
  t.true(output.context.includes('remain B'), 'Retains other heading content from fileB');
});

test('Given an unknown mode, Then returns fallback text and zero file stats', async (t) => {
  const files = {
    'dummy.md': `# Just a dummy file`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({ fs });

  const { context: out, stats } = await context.build_context({
    mode: 'non-existent-mode',
    files: [{ path: 'dummy.md' }],
  });

  t.true(out.includes('(No valid mode selected.)'), 'Fallback message should appear');
  t.is(stats.file_count, 0, 'No files processed for unknown mode');
});

test('Given all-open-linked mode, When link_depth=2, Then BFS includes transitive links up to 2 hops', async (t) => {
  const files = {
    'noteA.md': `[[noteB]]\n[[noteC]]`,
    'noteB.md': `[[noteD]]\n# Secret\nexcluded B`,
    'noteC.md': `No links here`,
    'noteD.md': `# Title D\nSome D content`,
  };
  const fs = new InMemoryFs(files);
  const context = new SmartContext({
    fs,
    settings: {
      excluded_headings: ['Secret'],
      before_prompt: '',
      before_each_prompt: '',
      after_each_prompt: '',
      after_prompt: '',
      link_depth: 2,
      max_linked_files: 0,
    },
  });

  const { context: out, stats } = await context.build_context({
    mode: 'all-open-linked',
    label: 'All open linked',
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

  t.true(out.includes('noteB.md'), 'noteB included (hop=1)');
  t.true(out.includes('noteC.md'), 'noteC included (hop=1)');
  t.true(out.includes('noteD.md'), 'noteD included (hop=2)');
  t.false(out.includes('excluded B'), 'excluded heading from noteB not included');
  t.true(out.includes('Some D content'), 'noteD content included');
  t.is(stats.file_count, 4, 'All 4 notes included in final stats');
});

test('Given before_each/after_each placeholders, When building context, Then placeholders are replaced', async (t) => {
  const files = {
    'notes/test1.md': `# Heading\nFile 1 content`,
    'test2.md': `Some other content`,
  };
  const fs = new InMemoryFs(files);

  const context = new SmartContext({
    fs,
    settings: {
      excluded_headings: [],
      before_each_prompt: '',
      after_each_prompt: '',
      before_prompt: '',
      after_prompt: '',
      link_depth: 0,
      max_linked_files: 0,
    },
  });

  const output = await context.build_context({
    mode: 'all-open',
    label: 'Test placeholders',
    files: [{ path: 'notes/test1.md' }, { path: 'test2.md' }],
  });

  // Should see defaults: ---{{FILE_PATH}}--- and ------
  t.true(output.context.includes('<context path="notes/test1.md">'), 'before_each replaced FILE_PATH for test1');
  t.true(output.context.includes('<context path="test2.md">'), 'before_each replaced FILE_PATH for test2');
  t.true(output.context.includes('</context>'), 'after_each default found');
});
