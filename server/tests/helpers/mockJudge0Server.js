import http from 'http';
import crypto from 'crypto';

/**
 * Deterministic Local Mock Judge0 HTTP Server.
 * Implements the Judge0 CE API contract for hermetic local integration testing.
 * 
 * Complies with strict testing policy:
 * - Deterministic fixture responses based on request metadata and markers.
 * - Zero execution of untrusted code.
 * - Zero external network calls.
 * - Zero container orchestration.
 */
export class MockJudge0Server {
  constructor(options = {}) {
    this.port = options.port || 0;
    this.host = options.host || '127.0.0.1';
    this.apiKey = options.apiKey || null;
    this.authzToken = options.authzToken || null;
    this.requireAuth = Boolean(options.requireAuth);

    this.server = null;
    this.url = null;
    this.requests = [];
    this.submissions = new Map();

    // Controllable test injection flags
    this.simulateAuthFailure = false;
    this.simulateRateLimit = false;
    this.simulateServerError = false;
    this.simulateMalformedJson = false;
    this.simulatedDelayMs = 0;
    this.customRouteHandlers = new Map();
  }

  /**
   * Starts the mock HTTP server on an ephemeral OS-assigned port.
   * @returns {Promise<{ port: number, url: string }>}
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handleRequest(req, res));

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        const addr = this.server.address();
        this.port = addr.port;
        this.url = `http://${this.host}:${this.port}`;
        resolve({ port: this.port, url: this.url });
      });
    });
  }

  /**
   * Stops the mock HTTP server.
   * @returns {Promise<void>}
   */
  async stop() {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        return resolve();
      }
      this.server.close((err) => {
        if (err) return reject(err);
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Resets all recorded requests and test-injection controls.
   */
  reset() {
    this.requests = [];
    this.submissions.clear();
    this.simulateAuthFailure = false;
    this.simulateRateLimit = false;
    this.simulateServerError = false;
    this.simulateMalformedJson = false;
    this.simulatedDelayMs = 0;
    this.customRouteHandlers.clear();
  }

  /**
   * Returns array of recorded requests.
   */
  getRequests() {
    return [...this.requests];
  }

  /**
   * Returns the last recorded request.
   */
  getLastRequest() {
    return this.requests.length > 0 ? this.requests[this.requests.length - 1] : null;
  }

  // ── Private Request Dispatcher ─────────────────────────────────────────────

  async _handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${this.host}:${this.port}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // Buffer the request body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let parsedBody = null;
    if (rawBody && (req.headers['content-type'] || '').includes('application/json')) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = rawBody;
      }
    } else {
      parsedBody = rawBody;
    }

    // Record request for test assertions
    const recordedReq = {
      method,
      url: req.url,
      pathname,
      searchParams: Object.fromEntries(parsedUrl.searchParams),
      headers: req.headers,
      body: parsedBody,
      rawBody,
      timestamp: Date.now()
    };
    this.requests.push(recordedReq);

    // Apply simulated delay if configured
    if (this.simulatedDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulatedDelayMs));
    }

    // Custom route overrides for specific unit test edge-cases
    const customKey = `${method} ${pathname}`;
    if (this.customRouteHandlers.has(customKey)) {
      return this.customRouteHandlers.get(customKey)(req, res, recordedReq);
    }

    // Simulated Server Failure
    if (this.simulateServerError) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Internal Server Error: Mock daemon crashed' }));
    }

    // Simulated Malformed JSON Response
    if (this.simulateMalformedJson) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('{"broken_json: true, unterminated');
    }

    // Simulated Rate Limit
    if (this.simulateRateLimit) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Rate limit exceeded: Too many requests' }));
    }

    // Authentication Verification (if enabled or simulated)
    if (this.simulateAuthFailure) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing authentication credentials' }));
    }

    if (this.requireAuth) {
      const incomingToken = req.headers['x-auth-token'];
      if (!incomingToken || (this.apiKey && incomingToken !== this.apiKey)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized: Invalid X-Auth-Token' }));
      }
      if (this.authzToken) {
        const incomingUser = req.headers['x-auth-user'];
        if (!incomingUser || incomingUser !== this.authzToken) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Forbidden: Invalid X-Auth-User' }));
        }
      }
    }

    // Route dispatch
    if (method === 'GET' && (pathname === '/about' || pathname === '/about/')) {
      return this._handleAbout(res);
    }

    if (method === 'GET' && (pathname === '/languages' || pathname === '/languages/')) {
      return this._handleLanguages(res);
    }

    if (method === 'POST' && (pathname === '/submissions' || pathname === '/submissions/')) {
      const wait = parsedUrl.searchParams.get('wait') === 'true';
      return this._handleSubmissions(res, parsedBody, wait);
    }

    if (method === 'GET' && pathname.startsWith('/submissions/')) {
      const token = pathname.replace('/submissions/', '').trim();
      return this._handleGetSubmission(res, token);
    }

    if (method === 'DELETE' && pathname.startsWith('/submissions/')) {
      const token = pathname.replace('/submissions/', '').trim();
      return this._handleDeleteSubmission(res, token);
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `MockJudge0: Route not found: ${method} ${pathname}` }));
  }

  _handleAbout(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      version: '1.13.1',
      homepage: 'https://judge0.com',
      details: 'TestForge Local Mock Judge0 CE Daemon',
      arch: 'aarch64_simulated',
      compiler_options: {}
    }));
  }

  _handleLanguages(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([
      { id: 63, name: 'JavaScript (Node.js 18.15.0)', is_archived: false },
      { id: 71, name: 'Python (3.11.2)', is_archived: false },
      { id: 62, name: 'Java (OpenJDK 17)', is_archived: false },
      { id: 54, name: 'C++ (GCC 9.2.0)', is_archived: false }
    ]));
  }

  _handleSubmissions(res, body, wait) {
    if (!body || typeof body !== 'object') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing or invalid submission body' }));
    }

    const token = `mock-sub-${crypto.randomUUID()}`;
    const code = String(body.source_code || '');
    const stdin = String(body.stdin || '');
    const languageId = Number(body.language_id);
    const cpuLimit = Number(body.cpu_time_limit || 2);
    const memLimit = Number(body.memory_limit || 262144);

    const submissionResult = this._synthesizeExecutionResult({
      token,
      code,
      stdin,
      languageId,
      cpuLimit,
      memLimit
    });

    this.submissions.set(token, submissionResult);

    if (wait) {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(submissionResult));
    }

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token }));
  }

  _handleGetSubmission(res, token) {
    if (!this.submissions.has(token)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Submission not found', token }));
    }
    const submission = this.submissions.get(token);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(submission));
  }

  _handleDeleteSubmission(res, token) {
    if (!this.submissions.has(token)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Submission not found', token }));
    }
    const submission = this.submissions.get(token);
    // Judge0 CE rejects deletion of in_queue (1) and processing (2) submissions with HTTP 400
    if (submission && submission.status && (submission.status.id === 1 || submission.status.id === 2)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Cannot delete submission in queue or processing', token }));
    }
    this.submissions.delete(token);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Submission deleted successfully', token }));
  }

  /**
   * Deterministically synthesizes realistic Judge0 execution responses
   * based on explicit test markers, inputs, or problem patterns.
   */
  _synthesizeExecutionResult({ token, code, stdin, languageId, cpuLimit, memLimit }) {
    // 1. Compilation Error Simulation
    if (code.includes('// COMPILE_ERROR') || code.includes('/* COMPILE_ERROR */') || code.includes('SYNTAX_ERROR')) {
      return {
        token,
        status: { id: 6, description: 'Compilation Error' },
        stdout: null,
        stderr: null,
        compile_output: `In file included from solution:1:\nLine 1: error: expected ';' before '}'\nCompilation failed with exit code 1`,
        message: null,
        time: '0.040',
        memory: 12000,
        cpu_time_limit: cpuLimit,
        memory_limit: memLimit
      };
    }

    // 2. Time Limit Exceeded (TLE) Simulation
    if (code.includes('// TIMEOUT') || code.includes('// TLE') || stdin.includes('FORCE_TLE')) {
      return {
        token,
        status: { id: 5, description: 'Time Limit Exceeded' },
        stdout: null,
        stderr: null,
        compile_output: null,
        message: 'Time limit exceeded',
        time: String((cpuLimit + 0.05).toFixed(3)),
        memory: 24000,
        cpu_time_limit: cpuLimit,
        memory_limit: memLimit
      };
    }

    // 3. Memory Limit Exceeded (MLE) Simulation
    if (code.includes('// MEMORY_ERROR') || code.includes('// MLE') || stdin.includes('FORCE_MLE')) {
      return {
        token,
        status: { id: 12, description: 'Runtime Error (NZEC)' },
        stdout: null,
        stderr: 'java.lang.OutOfMemoryError: Java heap space',
        compile_output: null,
        message: 'Memory limit exceeded',
        time: '0.120',
        memory: memLimit + 1024,
        memory_limit: memLimit
      };
    }

    // 4. Runtime Error (NZEC) Simulation
    if (code.includes('// RUNTIME_ERROR') || code.includes('ZERO_DIVISION') || stdin.includes('FORCE_RUNTIME_ERROR')) {
      return {
        token,
        status: { id: 11, description: 'Runtime Error (NZEC)' },
        stdout: null,
        stderr: 'ZeroDivisionError: division by zero\n  at solution.py line 4',
        compile_output: null,
        message: 'Exited with return code 1',
        time: '0.015',
        memory: 14000,
        cpu_time_limit: cpuLimit,
        memory_limit: memLimit
      };
    }

    // 5. Internal Error (Judge0 daemon / Isolate failure) Simulation
    if (code.includes('// INTERNAL_ERROR') || stdin.includes('FORCE_INTERNAL_ERROR')) {
      return {
        token,
        status: { id: 13, description: 'Internal Error' },
        stdout: null,
        stderr: null,
        compile_output: null,
        message: 'Box creation failed: isolate daemon cannot create sandbox box',
        time: '0.000',
        memory: 0,
        cpu_time_limit: cpuLimit,
        memory_limit: memLimit
      };
    }

    // 6. Wrong Answer Simulation
    if (code.includes('WRONG_ANSWER') || stdin.includes('WRONG_ANSWER')) {
      return {
        token,
        status: { id: 3, description: 'Accepted' },
        stdout: '999999\n', // Mismatched output
        stderr: null,
        compile_output: null,
        message: null,
        time: '0.018',
        memory: 15400,
        cpu_time_limit: cpuLimit,
        memory_limit: memLimit
      };
    }

    // 7. Standard Accepted Output Determinism
    // For standard test problems (e.g. Two Sum, Fibonacci, Palindrome, Sum of Digits)
    let output = '42\n';
    try {
      const parsedStdin = JSON.parse(stdin);
      if (Array.isArray(parsedStdin)) {
        // Two Sum standard fixture: nums = [2,7,11,15], target = 9 -> [0, 1]
        if (parsedStdin.length === 2 && Array.isArray(parsedStdin[0]) && typeof parsedStdin[1] === 'number') {
          const nums = parsedStdin[0];
          const target = parsedStdin[1];
          const map = new Map();
          let pair = null;
          for (let i = 0; i < nums.length; i++) {
            const comp = target - nums[i];
            if (map.has(comp)) {
              pair = [map.get(comp), i];
              break;
            }
            map.set(nums[i], i);
          }
          output = pair ? JSON.stringify(pair) : '[]';
        } else if (parsedStdin.length === 1 && typeof parsedStdin[0] === 'number') {
          // Single number input e.g. n -> return n * 2 or Fibonacci fixture
          output = String(parsedStdin[0] * 2);
        } else {
          output = JSON.stringify(parsedStdin);
        }
      } else if (typeof parsedStdin === 'number') {
        output = String(parsedStdin * 2);
      } else {
        output = String(stdin).trim();
      }
    } catch {
      // If stdin is raw string
      if (stdin.trim()) {
        output = stdin.trim();
      }
    }

    if (!output.endsWith('\n')) {
      output += '\n';
    }

    return {
      token,
      status: { id: 3, description: 'Accepted' },
      stdout: output,
      stderr: null,
      compile_output: null,
      message: null,
      time: '0.024',
      memory: 16384,
      cpu_time_limit: cpuLimit,
      memory_limit: memLimit
    };
  }
}

export default MockJudge0Server;
