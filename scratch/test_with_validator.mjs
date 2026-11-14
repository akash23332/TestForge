import { validateSingleTestCase } from '../server/src/services/codeRunner.service.js';
import { LocalExecutionProvider } from '../server/src/services/execution/LocalExecutionProvider.js';

async function testWithValidator() {
  const localProvider = new LocalExecutionProvider({ allowLocalExecution: true });

  console.log('--- Testing Python Two Sum through validateSingleTestCase ---');
  const pyCode = `class Solution:
    def twoSum(self, nums, target):
        lookup = {}
        for i, n in enumerate(nums):
            diff = target - n
            if diff in lookup:
                return [lookup[diff], i]
            lookup[n] = i
        return []`;
  const resPy = await validateSingleTestCase({
    code: pyCode,
    testCase: {
      _id: 'tc1',
      input: "nums = [2,7,11,15], target = 9",
      expectedOutput: "[0,1]"
    },
    questionContext: {
      title: 'Two Sum',
      language: 'python',
      executionMode: 'FUNCTION',
      functionName: 'twoSum',
      parameters: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }]
    },
    provider: localProvider
  });
  console.log('validateSingleTestCase Python result:', resPy);

  console.log('\n--- Testing Java Two Sum through validateSingleTestCase ---');
  const javaCode = `import java.util.*;
class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int comp = target - nums[i];
            if (map.containsKey(comp)) {
                return new int[] { map.get(comp), i };
            }
            map.put(nums[i], i);
        }
        return new int[0];
    }
}`;
  const resJava = await validateSingleTestCase({
    code: javaCode,
    testCase: {
      _id: 'tc2',
      input: "[3,2,4]\n6",
      expectedOutput: "[1,2]"
    },
    questionContext: {
      title: 'Two Sum',
      language: 'java',
      executionMode: 'FUNCTION',
      functionName: 'twoSum',
      returnType: 'int[]',
      parameters: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }]
    },
    provider: localProvider
  });
  console.log('validateSingleTestCase Java result:', resJava);

  console.log('\n--- Testing JavaScript Two Sum through validateSingleTestCase ---');
  const jsCode = `function twoSum(nums, target) {
    const m = new Map();
    for (let i = 0; i < nums.length; i++) {
        const diff = target - nums[i];
        if (m.has(diff)) return [m.get(diff), i];
        m.set(nums[i], i);
    }
    return [];
}`;
  const resJs = await validateSingleTestCase({
    code: jsCode,
    testCase: {
      _id: 'tc3',
      input: "[2,7,11,15]\n9",
      expectedOutput: "[0,1]"
    },
    questionContext: {
      title: 'Two Sum',
      language: 'javascript',
      executionMode: 'FUNCTION',
      functionName: 'twoSum',
      parameters: [{ name: 'nums', type: 'number[]' }, { name: 'target', type: 'number' }]
    },
    provider: localProvider
  });
  console.log('validateSingleTestCase JavaScript result:', resJs);
}

testWithValidator().catch(console.error);
