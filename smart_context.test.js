/**
 * @file smart_context.integration.test.js
 * @description Integration tests for SmartContext using Ava. These tests simulate
 * an environment where SmartContext is instantiated with mock data and callbacks,
 * then verifies that build_context produces expected output.
 * 
 * NOTE: This test assumes a Node.js environment and uses AVA as the test runner.
 * It mocks the Obsidian environment and provides in-memory file contents.
 * 
 * Run with: npx ava smart_context.integration.test.js
 */

import test from 'ava';
import { SmartContext } from './smart_context.js';

/**
 * Mock TFile class to simulate Obsidian's TFile objects.
 * @class
 */
class TFile {
  constructor(path, extension) {
    this.path = path;
    this.extension = extension;
  }
}

/**
 * Create a mock vault of files with content.
 */
const mockFiles = {
  'folder/file1.md': '# Heading 1\nContent of file1\n',
  'folder/file2.md': '# Secret\nShould be excluded\n# Visible\nVisible content\n',
  'folder/subfolder/file3.md': 'No secret here',
  'noteA.md': '[[noteB]]\n![[noteC]]',
  'noteB.md': '# Secret\nExcluded\n# Public\nIncluded B',
  'noteC.md': 'Content C',
};

/**
 * Mocks for SmartContext callbacks:
 */
async function get_file_contents(file) {
  return mockFiles[file.path] || '';
}

function get_file_by_path(path) {
  if (mockFiles[path]) return new TFile(path, path.endsWith('.md') ? 'md' : 'canvas');
  return null;
}

function resolve_link(linkText, currentPath) {
  // simplistic resolver: 
  // - If [[foo]] => 'foo.md' if exists
  // - Otherwise return undefined
  // Here we do a basic guess: try `linkText + '.md'`
  const baseDir = currentPath.substring(0, currentPath.lastIndexOf('/'));
  let candidatePaths = [
    linkText,
    linkText + '.md',
    (baseDir ? baseDir + '/' + linkText : linkText),
    (baseDir ? baseDir + '/' + linkText + '.md' : linkText + '.md')
  ].filter(p => mockFiles[p]);
  
  return candidatePaths.length > 0 ? candidatePaths[0] : undefined;
}

function get_embeds_for_file(file) {
  // Embeds are lines like ![[noteC]]
  const content = mockFiles[file.path] || '';
  const embedRegex = /!\[\[([^\]]+)\]\]/g;
  let match;
  const embedded = new Set();
  while ((match = embedRegex.exec(content)) !== null) {
    const linked = resolve_link(match[1], file.path);
    if (linked && mockFiles[linked]) {
      embedded.add(linked);
    }
  }
  return embedded;
}

function get_links_for_file(file) {
  const content = mockFiles[file.path] || '';
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const embedRegex = /!\[\[([^\]]+)\]\]/g;
  
  let links = [];
  let embeds = [];
  
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const linked = resolve_link(match[1], file.path);
    if (linked) links.push(linked);
  }
  while ((match = embedRegex.exec(content)) !== null) {
    const linked = resolve_link(match[1], file.path);
    if (linked) embeds.push(linked);
  }

  return { links, embeds };
}

const settings = {
  excluded_headings: ['Secret'],
  output_template: '=== Start of Context ==='
};

const smartContext = new SmartContext({
  get_file_contents,
  resolve_link,
  get_file_by_path,
  get_embeds_for_file,
  get_links_for_file,
  settings
});

test('folder mode copies all files in a folder, respects exclusions', async t => {
  const folder_structure = `└── file1.md\n└── file2.md\n└── subfolder/\n    └── file3.md\n`;
  const files = [
    new TFile('folder/file1.md', 'md'),
    new TFile('folder/file2.md', 'md'),
    new TFile('folder/subfolder/file3.md', 'md'),
  ];

  const context_opts = {
    label: 'Test Folder',
    mode: 'folder',
    files,
    folder_structure,
    excluded_headings: ['Secret'],
    output_template: '=== Folder Context ==='
  };

  const output = await smartContext.build_context(context_opts);

  t.true(output.includes('=== Folder Context ==='));
  t.true(output.includes('Test Folder:'));
  t.true(output.includes('folder structure:'));
  t.true(output.includes('file1.md'));
  t.true(output.includes('file2.md'));
  t.true(output.includes('file3.md'));

  // file2.md has a secret heading that should be excluded
  t.false(output.includes('Should be excluded'));
  t.true(output.includes('Visible content'));
});

test('visible mode copies only given files, excludes headings', async t => {
  const files = [new TFile('folder/file2.md', 'md')];

  const context_opts = {
    label: 'Open files contents',
    mode: 'visible',
    files,
    excluded_headings: ['Secret'],
    output_template: ''
  };

  const output = await smartContext.build_context(context_opts);
  t.true(output.includes('Open files contents:'));
  // Secret excluded, visible included
  t.false(output.includes('Should be excluded'));
  t.true(output.includes('Visible content'));
});

test('all-open mode copies all files given, no folder structure needed', async t => {
  const files = [new TFile('folder/file1.md', 'md'), new TFile('folder/file2.md', 'md')];

  const context_opts = {
    label: 'Open files contents',
    mode: 'all-open',
    files,
    excluded_headings: ['Secret'],
    output_template: '=== Global Context ==='
  };

  const output = await smartContext.build_context(context_opts);
  t.true(output.includes('=== Global Context ==='));
  t.true(output.includes('/folder/file1.md'));
  t.true(output.includes('/folder/file2.md'));
  t.false(output.includes('Should be excluded'));
});

test('visible-linked mode includes linked files except embedded ones, excludes secret', async t => {
  // initial files: noteA.md (links to noteB, embed noteC)
  const initial_files = [new TFile('noteA.md', 'md')];
  // all_files includes A, B, C since B and C are linked
  const all_files = [
    new TFile('noteA.md', 'md'),
    new TFile('noteB.md', 'md'),
    new TFile('noteC.md', 'md')
  ];

  const context_opts = {
    label: 'Visible open files',
    mode: 'visible-linked',
    initial_files,
    all_files,
    excluded_headings: ['Secret'],
    output_template: ''
  };

  const output = await smartContext.build_context(context_opts);
  // Linked files section should include noteB if not embedded
  // noteC is embedded inside noteA, so it shouldn't appear in Linked files section
  t.true(output.includes('Linked files:'));
  t.true(output.includes('/noteB.md'));
  t.false(output.includes('/noteC.md') && output.indexOf('Linked files:') < output.indexOf('/noteC.md'));

  // noteA section should inline embed noteC
  t.true(output.includes('> [!embed] noteC.md'));
  t.true(output.includes('Content C'));

  // Secret in noteB is excluded
  t.false(output.includes('Excluded'));
  // Public in noteB is included
  t.true(output.includes('Included B'));
});

test('all-open-linked mode includes all open + linked files, respects embeddings and exclusions', async t => {
  // initial files: noteA
  // all_files: A,B,C
  const initial_files = [new TFile('noteA.md', 'md')];
  const all_files = [
    new TFile('noteA.md', 'md'),
    new TFile('noteB.md', 'md'),
    new TFile('noteC.md', 'md')
  ];

  const context_opts = {
    label: 'All open files',
    mode: 'all-open-linked',
    initial_files,
    all_files,
    excluded_headings: ['Secret'],
    output_template: '=== Start of Context ==='
  };

  const output = await smartContext.build_context(context_opts);
  t.true(output.includes('=== Start of Context ==='));
  t.true(output.includes('Linked files:'));
  // noteB is linked but not embedded in A, should appear in linked files section
  t.true(output.includes('/noteB.md'));
  // noteC is embedded in A, should appear in A's section inlined
  t.true(output.includes('> [!embed] noteC.md'));
  // Exclusions hold
  t.false(output.includes('Excluded')); 
  t.true(output.includes('Included B'));
  t.true(output.includes('Content C'));
});
