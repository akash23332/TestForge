const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const file = path.join(os.tmpdir(), 'TestJava.java');
fs.writeFileSync(file, 'public class TestJava { public static void main(String[] args) { System.out.println(42); } }');
const t0 = Date.now();
try {
  const out = execSync(`java "${file}"`, { encoding: 'utf8', timeout: 8000 });
  console.log('Success in', Date.now() - t0, 'ms:', out.trim());
} catch (e) {
  console.log('Failed in', Date.now() - t0, 'ms:', e.message);
} finally {
  try { fs.unlinkSync(file); } catch {}
}
