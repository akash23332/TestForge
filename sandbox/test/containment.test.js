/**
 * TestForge Sandbox Live Containment Test Suite
 * Intended to be run against a live isolated sandbox instance (e.g. http://127.0.0.1:5050).
 * Tests real hostile payloads inside the sandbox without endangering the host.
 */

import http from 'http';

const SANDBOX_URL = process.env.SANDBOX_ENDPOINT || 'http://127.0.0.1:5050';
const API_KEY = process.env.SANDBOX_API_KEY || 'testforge_sandbox_internal_secret';

const executeRemote = (payload) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SANDBOX_URL}/execute`);
    const data = JSON.stringify(payload);

    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'Authorization': `Bearer ${API_KEY}`
        },
        timeout: 10000
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ statusCode: res.statusCode, raw: body });
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(data);
    req.end();
  });
};

export const runContainmentSuite = async () => {
  console.log(`[ContainmentTest] Probing sandbox daemon at ${SANDBOX_URL}...`);

  // Check health
  const healthCheck = await new Promise((resolve) => {
    http.get(`${SANDBOX_URL}/health`, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve(res.statusCode === 200));
    }).on('error', () => resolve(false));
  });

  if (!healthCheck) {
    console.log('[ContainmentTest] Sandbox daemon is not running at target URL. Skipping live execution.');
    return;
  }

  console.log('[ContainmentTest] Running live hostile code containment tests...');

  // 1. Environment theft
  const envTest = await executeRemote({
    language: 'python',
    code: 'import os, json\ndef solution(): return json.dumps(dict(os.environ))',
    limits: { timeoutMs: 3000 }
  });
  console.log('1. Env Variable Leak Check:', !JSON.stringify(envTest.body).includes('MONGODB_URI') ? 'PASS (Clean env)' : 'FAIL');

  // 2. Memory exhaustion
  const memTest = await executeRemote({
    language: 'python',
    code: 'def solution(): x = bytearray(1024 * 1024 * 400); return len(x)',
    limits: { memoryLimitMb: 128, timeoutMs: 3000 }
  });
  console.log('2. Memory Limit Enforcement:', memTest.body.status === 'memory_limit_exceeded' ? 'PASS (Killed on OOM)' : 'FAIL');

  // 3. Infinite loop
  const loopTest = await executeRemote({
    language: 'javascript',
    code: 'function solution() { while(true); }',
    limits: { timeoutMs: 1500 }
  });
  console.log('3. Infinite Loop Timeout:', loopTest.body.status === 'timeout' ? 'PASS (SIGKILL triggered)' : 'FAIL');
};

if (process.argv[1]?.endsWith('containment.test.js')) {
  runContainmentSuite().catch(console.error);
}

export default runContainmentSuite;
