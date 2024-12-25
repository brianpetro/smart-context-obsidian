/**
 * @file test_smart_context_module.js
 * @description Example AVA integration tests for SmartContextModule
 */

import test from 'ava';
import { SmartContextModule } from './smart_context_module.js';

/**
 * Mock in-memory SmartFs-like adapter.
 * - Expects `files` as a dictionary of path->string content.
 */
class InMemoryFs {
  constructor(files = {}) {
    this.files = files;  // { "folder/file1.md": "#Heading\nContent", ... }
  }
  async read(path, encoding = 'utf-8') {
    if (!this.files.hasOwnProperty(path)) {
      throw new Error(`File not found: ${path}`);
    }
    return this.files[path];
  }
}

test('build_context in folder mode merges multiple files, excluding heading sections', async (t) => {
  // 1) Mock files in memory
  const files = {
    'folder/file1.md': `# Title\nSome content\n# Secret\nExcluded content\n`,
    'folder/file2.md': `Regular content only`,
  };
  const mockFs = new InMemoryFs(files);

  // 2) Instantiate the module
  const smartContext = new SmartContextModule({
    fs: mockFs,
    settings: {
      excluded_headings: ['Secret'],
    },
  });

  // 3) Build context for folder mode
  const output = await smartContext.build_context({
    mode: 'folder',
    label: 'Test Folder Output',
    files: [
      { path: 'folder/file1.md' },
      { path: 'folder/file2.md' },
    ],
    folder_structure: '└── file1.md\n└── file2.md\n',
    excluded_headings: ['Secret'],
    output_template: '=== FOLDER TEST ===',
  });

  // 4) Assertions
  // Should exclude “Excluded content”
  t.false(output.includes('Excluded content'), 'Excluded heading content should be stripped.');
  // Should contain file2’s content
  t.true(output.includes('Regular content only'));
  // Should contain the appended template
  t.true(output.includes('=== FOLDER TEST ==='));
  // Should mention the label
  t.true(output.includes('Test Folder Output'));
});

test('build_context with visible mode copies just the given files, respects excluded headings', async (t) => {
  const files = {
    'myNote.md': `# Secret\nShould exclude\n# Visible\nShould remain\n`,
  };
  const mockFs = new InMemoryFs(files);

  const smartContext = new SmartContextModule({
    fs: mockFs,
    settings: {
      excluded_headings: ['Secret'],
    },
  });

  const output = await smartContext.build_context({
    mode: 'visible',
    label: 'Open files contents',
    files: [{ path: 'myNote.md' }],
    excluded_headings: ['Secret'],
  });

  t.true(output.includes('/myNote.md'));
  t.false(output.includes('Should exclude'));
  t.true(output.includes('Should remain'));
});