import { runCodeIsolated, runJavaIsolated, runPythonIsolated, runCppIsolated } from '../server/src/services/codeRunner.service.js';
import { wrapCodeForExecution } from '../server/src/services/codeContract.service.js';

async function diagnose() {
  console.log('--- Diagnosing Python Two Sum ---');
  const pyCode = `class Solution:
    def twoSum(self, nums, target):
        lookup = {}
        for i, n in enumerate(nums):
            diff = target - n
            if diff in lookup:
                return [lookup[diff], i]
            lookup[n] = i
        return []`;
  const pyWrapped = wrapCodeForExecution({
    code: pyCode,
    language: 'python',
    executionMode: 'FUNCTION',
    functionName: 'twoSum',
    parameters: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }]
  });
  console.log('InputArgs passed as: "nums = [2,7,11,15], target = 9"');
  const pyRes = await runPythonIsolated({ code: pyWrapped, inputArgs: "nums = [2,7,11,15], target = 9", timeoutMs: 4000 });
  console.log('Python Result:', pyRes);

  console.log('\n--- Diagnosing Java Two Sum ---');
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
  const javaWrapped = wrapCodeForExecution({
    code: javaCode,
    language: 'java',
    executionMode: 'FUNCTION',
    functionName: 'twoSum',
    returnType: 'int[]',
    parameters: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }]
  });
  const javaRes = await runJavaIsolated({ code: javaWrapped, inputArgs: "nums = [3,2,4], target = 6", timeoutMs: 6000 });
  console.log('Java Result:', javaRes);

  console.log('\n--- Diagnosing JavaScript Two Sum ---');
  const jsCode = `function twoSum(nums, target) {
    const m = new Map();
    for (let i = 0; i < nums.length; i++) {
        const diff = target - nums[i];
        if (m.has(diff)) return [m.get(diff), i];
        m.set(nums[i], i);
    }
    return [];
}`;
  const jsWrapped = wrapCodeForExecution({
    code: jsCode,
    language: 'javascript',
    executionMode: 'FUNCTION',
    functionName: 'twoSum',
    parameters: [{ name: 'nums', type: 'number[]' }, { name: 'target', type: 'number' }]
  });
  const jsRes = await runCodeIsolated({ code: jsWrapped, inputArgs: "nums = [2,7,11,15], target = 9", timeoutMs: 3000 });
  console.log('JavaScript Result:', jsRes);
}

diagnose().catch(console.error);
