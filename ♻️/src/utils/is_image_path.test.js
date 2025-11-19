import test from 'ava';
import { is_image_path } from './is_image_path.js';

test('recognizes common image extensions', t => {
  t.true(is_image_path('foo.png'));
  t.true(is_image_path('bar.JPG'));
  t.true(is_image_path('baz.jpeg'));
  t.true(is_image_path('qux.gif'));
  t.true(is_image_path('zap.webp'));
  t.true(is_image_path('img.svg'));
});

test('returns false for non-image paths', t => {
  t.false(is_image_path('file.txt'));
  t.false(is_image_path('note.md'));
  t.false(is_image_path('picture.pn'));
});
