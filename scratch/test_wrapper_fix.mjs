import { buildJavaScriptWrapper } from '../server/src/services/execution/wrappers/javascriptWrapper.js';
import { runCodeIsolated } from '../server/src/services/codeRunner.service.js';

// Let's test how wrapped code executes
const code = `
function twoSum(nums, target) {
    const m = new Map();
    for (let i = 0; i < nums.length; i++) {
        const diff = target - nums[i];
        if (m.has(diff)) return [m.get(diff), i];
        m.set(nums[i], i);
    }
    return [];
}
`;

const wrapped = buildJavaScriptWrapper({
  code,
  functionName: 'twoSum',
  parameters: [{ name: 'nums', type: 'number[]' }, { name: 'target', type: 'number' }]
});

console.log('Wrapped starts with:', wrapped.slice(0, 100));
