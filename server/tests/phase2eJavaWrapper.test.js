import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { buildJavaWrapper } from '../src/services/execution/wrappers/javaWrapper.js';

describe('Phase 2E Task 1: Java Wrapper Multiline & Structured Input Parsing Tests', () => {
  const tmpDir = path.join(os.tmpdir(), `testforge_java_${Date.now()}`);

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  const runJavaSolution = ({ userCode, input, functionName = 'solution', dataStructure = 'ARRAY' }) => {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const runDir = path.join(tmpDir, runId);
    fs.mkdirSync(runDir, { recursive: true });

    const wrapped = buildJavaWrapper({
      code: userCode,
      functionName,
      dataStructure
    });

    const javaFile = path.join(runDir, 'Main.java');
    fs.writeFileSync(javaFile, wrapped, 'utf-8');

    execSync(`javac "${javaFile}"`, {
      cwd: runDir,
      timeout: 10000,
      encoding: 'utf-8'
    });

    const stdout = execSync(`java -cp "${runDir}" Main`, {
      input,
      cwd: runDir,
      timeout: 6000,
      encoding: 'utf-8'
    });

    return stdout.trim();
  };

  test('1. Parses array with spaces across lines: [1, 2, 3]\\n4', () => {
    const code = `
    public class Solution {
        public int[] solution(int[] nums, int target) {
            int[] res = new int[nums.length];
            for (int i = 0; i < nums.length; i++) res[i] = nums[i] + target;
            return res;
        }
    }`;
    const output = runJavaSolution({
      userCode: code,
      input: '[1, 2, 3]\n4'
    });
    expect(output).toBe('[5,6,7]');
  });

  test('2. Parses [3,2,4]\\n6 with Unix line ending', () => {
    const code = `
    public class Solution {
        public int[] twoSum(int[] nums, int target) {
            for (int i = 0; i < nums.length; i++) {
                for (int j = i + 1; j < nums.length; j++) {
                    if (nums[i] + nums[j] == target) return new int[]{i, j};
                }
            }
            return new int[0];
        }
    }`;
    const output = runJavaSolution({
      userCode: code,
      functionName: 'twoSum',
      input: '[3,2,4]\n6'
    });
    expect(output).toBe('[1,2]');
  });

  test('3. Parses Windows CRLF line ending: [1, 2, 3]\\r\\n4\\r\\n', () => {
    const code = `
    public class Solution {
        public int solution(int[] nums, int factor) {
            int sum = 0;
            for (int n : nums) sum += n;
            return sum * factor;
        }
    }`;
    const output = runJavaSolution({
      userCode: code,
      input: '[1, 2, 3]\r\n4\r\n'
    });
    expect(output).toBe('24');
  });

  test('4. Parses String array with spaces inside quotes: ["hello world", "test"]\\n2', () => {
    const code = `
    public class Solution {
        public String solution(String[] words, int index) {
            if (index >= 0 && index < words.length) return words[index];
            return "none";
        }
    }`;
    const output = runJavaSolution({
      userCode: code,
      input: '["hello world", "test"]\n2'
    });
    // index 2 is out of bounds, returns none
    expect(output).toBe('none');

    const output0 = runJavaSolution({
      userCode: code,
      input: '["hello world", "test"]\n0'
    });
    expect(output0).toBe('hello world');
  });

  test('5. Parses nested array / matrix: [[1, 2], [3, 4]]\\n10', () => {
    const code = `
    public class Solution {
        public int solution(int[][] matrix, int bonus) {
            int total = bonus;
            for (int[] row : matrix) {
                for (int val : row) total += val;
            }
            return total;
        }
    }`;
    const output = runJavaSolution({
      userCode: code,
      input: '[[1, 2], [3, 4]]\n10'
    });
    // total = 10 + 1 + 2 + 3 + 4 = 20
    expect(output).toBe('20');
  });

  test('6. Preserves spaces inside single String argument', () => {
    const code = `
    public class Solution {
        public String solution(String s) {
            return new StringBuilder(s).reverse().toString();
        }
    }`;
    const output = runJavaSolution({
      userCode: code,
      input: 'hello brave new world'
    });
    expect(output).toBe('dlrow wen evarb olleh');
  });

  test('7. Handles empty input safely', () => {
    const code = `
    public class Solution {
        public int solution(int[] nums) {
            return nums.length;
        }
    }`;
    const output = runJavaSolution({
      userCode: code,
      input: ''
    });
    expect(output).toBe('0');
  });

  test('8. Handles single-line bracketed array and argument: [1, 2, 3] 5', () => {
    const code = `
    public class Solution {
        public int solution(int[] nums, int multiplier) {
            int sum = 0;
            for (int n : nums) sum += n;
            return sum * multiplier;
        }
    }`;
    const output = runJavaSolution({
      userCode: code,
      input: '[1, 2, 3] 5'
    });
    // sum = 6 * 5 = 30
    expect(output).toBe('30');
  });
});
