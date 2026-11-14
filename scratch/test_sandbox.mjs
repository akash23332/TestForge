import vm from 'vm';

const stdout = [];
const sandbox = {
  console: { log: (...args) => stdout.push(args.join(' ')), error: () => {} },
  require: () => ({ readFileSync: () => '[2,7,11,15]\n9' }),
  __args: ['[2,7,11,15]', '9'],
  __result: undefined,
  __hasResult: false
};

const code = `
  function twoSum(nums, target) {
    console.log('debugging log from student');
    return [0, 1];
  }
  const res = twoSum([2,7,11,15], 9);
  if (typeof __hasResult !== 'undefined') {
    __result = res;
    __hasResult = true;
  }
  console.log(JSON.stringify(res));
`;

const script = new vm.Script(code);
const ctx = vm.createContext(sandbox);
script.runInContext(ctx);
console.log('sandbox.__hasResult:', sandbox.__hasResult);
console.log('sandbox.__result:', sandbox.__result);
console.log('stdout:', stdout);
