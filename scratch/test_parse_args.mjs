import { parseInputArguments } from '../server/src/services/codeRunner.service.js';

const testCases = [
  'nums = [2,7,11,15], target = 9',
  'nums = [-1,0,3,5,9,12], target = 9',
  'head = [1,2,3,4,5]',
  'root = [4,2,7,1,3,6,9]',
  's = "hello", k = 2',
  'head = [1,2,3], values = [4,5,6]',
  '[3, 2, 4]\n6',
  '[[1,2],[3,4]]',
  'true\nfalse',
  '42'
];

for (const tc of testCases) {
  console.log('INPUT:', JSON.stringify(tc));
  console.log('PARSED:', parseInputArguments(tc));
  console.log('---');
}
