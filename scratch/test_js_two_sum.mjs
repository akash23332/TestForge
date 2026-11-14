import { runCodeIsolated } from '../server/src/services/codeRunner.service.js';
import { wrapCodeForExecution } from '../server/src/services/codeContract.service.js';

const jsCode = `function twoSum(nums, target) {
    const m = new Map();
    for (let i = 0; i < nums.length; i++) {
        const diff = target - nums[i];
        if (m.has(diff)) return [m.get(diff), i];
        m.set(nums[i], i);
    }
    return [];
}`;

const wrapped = wrapCodeForExecution({
  code: jsCode,
  language: 'javascript',
  executionMode: 'FUNCTION',
  functionName: 'twoSum',
  parameters: [{ name: 'nums', type: 'number[]' }, { name: 'target', type: 'number' }]
});

async function main() {
  const res = await runCodeIsolated({
    code: wrapped,
    inputArgs: [[2, 7, 11, 15], 9],
    timeoutMs: 3000
  });

  console.log('Result from runCodeIsolated:', res);
}

main().catch(console.error);
