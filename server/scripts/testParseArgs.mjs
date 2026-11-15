import { parseInputArguments } from '../src/services/codeRunner.service.js';

console.log('1:', parseInputArguments('2 4 3\n5 6 4'));
console.log('2:', parseInputArguments('"2 4 3"\n"5 6 4"'));
console.log('3:', parseInputArguments('[2, 4, 3]\n[5, 6, 4]'));
console.log('4:', parseInputArguments('l1 = [2, 4, 3], l2 = [5, 6, 4]'));
console.log('5:', parseInputArguments('"[2, 4, 3]"\n"[5, 6, 4]"'));
