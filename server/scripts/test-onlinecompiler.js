import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Resolve current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import the actual OnlineCompilerProvider implementation
import { OnlineCompilerProvider } from '../src/services/execution/OnlineCompilerProvider.js';

async function main() {
  console.log('='.repeat(60));
  console.log('TestForge OnlineCompilerProvider Integration Test');
  console.log('='.repeat(60));

  try {
    // 1. Initialize provider using actual backend environment configuration
    const provider = new OnlineCompilerProvider();

    // 2. Security validation: Verify credentials exist without printing them
    if (!provider.isConfigured()) {
      console.error('\n[ERROR] OnlineCompilerProvider is not configured.');
      console.error('Please verify that ONLINE_COMPILER_API_KEY is defined in server/.env');
      process.exit(1);
    }

    const pythonCode = 'print("TestForge OnlineCompiler Working")';

    console.log(`\nProvider Name   : ${provider.name}`);
    console.log(`Target Language : python`);
    console.log(`Dispatched Code : ${pythonCode.trim()}`);
    console.log('Dispatching synchronous request to OnlineCompiler API...\n');

    // 3. Execute code via actual provider executeCode() method
    const startTime = Date.now();
    const result = await provider.executeCode({
      language: 'python',
      code: pythonCode,
      inputArgs: '',
      timeoutMs: 10000
    });
    const totalElapsedMs = Date.now() - startTime;

    // 4. Print normalized execution output
    console.log('-'.repeat(60));
    console.log('Execution Result');
    console.log('-'.repeat(60));
    console.log(`Provider Name    : ${provider.name}`);
    console.log(`Execution Status : ${result.status}`);
    console.log(`Runtime          : ${result.runtimeMs} ms (Client elapsed: ${totalElapsedMs} ms)`);
    if (result.memoryKb !== undefined) {
      console.log(`Memory           : ${result.memoryKb} KB`);
    }
    console.log(`Output           :\n${result.output ? result.output.trimEnd() : '(no output)'}`);
    console.log(`Error            : ${result.error ? result.error : 'null'}`);
    console.log('-'.repeat(60));

    if (result.status === 'success' && result.output.includes('TestForge OnlineCompiler Working')) {
      console.log('\n[SUCCESS] OnlineCompilerProvider verified live against api.onlinecompiler.io!\n');
    } else {
      console.warn(`\n[WARNING] Execution completed with non-success status: ${result.status}\n`);
    }
  } catch (error) {
    console.error('\n[EXCEPTION] Error executing OnlineCompilerProvider test:');
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
