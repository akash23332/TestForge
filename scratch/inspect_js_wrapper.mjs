import { wrapCodeForExecution } from '../server/src/services/codeContract.service.js';
import { parseInputArguments } from '../server/src/services/codeRunner.service.js';

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

console.log('--- WRAPPED JS CODE ---');
console.log(wrapped);

const parsedArgs = parseInputArguments("[2,7,11,15]\n9");
console.log('\n--- PARSED ARGS ---', parsedArgs);
