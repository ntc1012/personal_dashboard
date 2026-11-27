import test from 'node:test';
import assert from 'node:assert/strict';
import { indexCedict } from '../src/lib/cedict';
test('CC-CEDICT accepts Windows line endings, variant spellings and bracket formats', () => {
  const raw =
    '# License header\r\n你好 你好 [ni3 hao3] /hello; hi/\r\n學習 学习 [[xue2 xi2]] /to study/to learn/\r\n';
  const dictionary = indexCedict(raw);
  assert.match(dictionary.get('你好')![0], /hello/);
  assert.deepEqual(dictionary.get('學習'), dictionary.get('学习'));
  assert.match(dictionary.get('学习')![0], /to learn/);
});
