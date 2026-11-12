import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const filesToInclude = [
  {
    index: 1,
    title: 'Phase 5.1C-13 Implementation & Lifecycle Report',
    path: 'PHASE_5_1C_13_IMPLEMENTATION_REPORT.md',
    category: 'AUDIT REPORT & FINDINGS',
    desc: 'Complete analysis of allowlist Isolate wrapper architecture, pre-initialization key validation, Open3 process execution, and error preservation.'
  },
  {
    index: 2,
    title: 'Constrained Root-Owned Isolate Invocation Wrapper',
    path: 'deploy/judge0/docker/isolate-wrapper.sh',
    category: 'SECURITY WRAPPER (ALLOWLIST)',
    desc: 'Schema-enforced argument allowlist wrapper restricting worker to single operation, decimal box IDs, approved cgroup flags, and canonical array execution.'
  },
  {
    index: 3,
    title: 'Judge0 IsolateJob Correlation Patch (Harden v3)',
    path: 'deploy/judge0/docker/patches/isolate_job_correlation.patch',
    category: 'SOURCE PATCH (GIT DIFF)',
    desc: 'Hardened patch validating key before sandbox creation, using Open3.capture3 with argument arrays, and preserving original errors during cleanup.'
  },
  {
    index: 4,
    title: 'Phase 5.1C-13 Lifecycle Hardening Test Suite',
    path: 'server/tests/phase51C13LifecycleHardening.test.js',
    category: 'JAVASCRIPT (JEST ESM)',
    desc: '24 comprehensive behavioral tests covering allowlist validation, argument injection, path traversal, key pre-validation, and error preservation.'
  },
  {
    index: 5,
    title: 'Resource & Cgroup Accounting Probe (Fail-Closed)',
    path: 'deploy/judge0/verify-resource-accounting.sh',
    category: 'SHELL SCRIPT (BASH)',
    desc: 'Pre-dispatch key & permissions checks, strict execution ID regex, single exact attempt binding, no || true on docker logs, and UNKNOWN/FAIL cleanup handling.'
  }
];

function escapePdf(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\)')
    .replace(/\)/g, '\\)')
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');
}

class PDFBuilder {
  constructor() {
    this.pages = [];
  }

  createPage() {
    const page = { lines: [] };
    this.pages.push(page);
    return page;
  }

  buildPDF() {
    const objects = [];
    const addObject = (content) => {
      const id = objects.length + 1;
      objects.push({ id, content });
      return id;
    };

    const f1Id = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
    const f2Id = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
    const f3Id = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const f4Id = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

    const pagesCatalogId = objects.length + 1;
    const pageObjIds = [];

    const totalPages = this.pages.length;

    for (let i = 0; i < totalPages; i++) {
      const page = this.pages[i];
      const pageNum = i + 1;

      // Footer
      const footerText = `TestForge Phase 5.1C-13 Wrapper & Lifecycle Hardening | Page ${pageNum} of ${totalPages}`;
      page.lines.push(
        `BT /F3 8 Tf 0.5 0.5 0.5 rg 40 22 Td (${escapePdf(footerText)}) Tj ET`,
        `BT /F4 8 Tf 0.1 0.4 0.8 rg 450 22 Td (SECURITY HARDENED) Tj ET`
      );

      const streamContent = page.lines.join('\n');
      const streamLen = Buffer.byteLength(streamContent, 'utf8');

      const streamObjId = addObject(`<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream`);
      pageObjIds.push(addObject(`<< /Type /Page /Parent ${pagesCatalogId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${f1Id} 0 R /F2 ${f2Id} 0 R /F3 ${f3Id} 0 R /F4 ${f4Id} 0 R >> >> /Contents ${streamObjId} 0 R >>`));
    }

    const kidsStr = pageObjIds.map(id => `${id} 0 R`).join(' ');
    addObject(`<< /Type /Pages /Kids [ ${kidsStr} ] /Count ${totalPages} >>`);
    const rootCatalogId = addObject(`<< /Type /Catalog /Pages ${pagesCatalogId} 0 R >>`);

    let output = '%PDF-1.4\n';
    const xrefOffsets = [0];

    for (const obj of objects) {
      xrefOffsets[obj.id] = Buffer.byteLength(output, 'utf8');
      output += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
    }

    const xrefStart = Buffer.byteLength(output, 'utf8');
    output += `xref\n0 ${objects.length + 1}\n`;
    output += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i++) {
      output += `${String(xrefOffsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    output += `trailer\n<< /Size ${objects.length + 1} /Root ${rootCatalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

    return Buffer.from(output, 'utf8');
  }
}

function generateBundle() {
  console.log('Starting Phase 5.1C-13 PDF generation...');
  const doc = new PDFBuilder();

  // Cover Page
  let page = doc.createPage();
  page.lines.push(
    'q 0.05 0.12 0.28 rg 0 0 595 842 re f Q',
    'q 0.12 0.35 0.65 rg 40 700 515 90 re f Q',
    'BT /F4 20 Tf 1 1 1 rg 60 745 Td (TESTFORGE AUDIT & VERIFICATION) Tj ET',
    'BT /F4 13 Tf 0.85 0.92 1 rg 60 720 Td (Phase 5.1C-13: Final Wrapper & Lifecycle Security Corrections) Tj ET',
    'BT /F4 11 Tf 1 1 1 rg 60 660 Td (OFFICIAL REMEDIATION ARTIFACT BUNDLE) Tj ET',
    'BT /F3 10 Tf 0.85 0.85 0.85 rg 60 642 Td (Date: November 12, 2026 | Environment: ARM64 Ubuntu 22.04 LTS / cgroups v1) Tj ET',
    'BT /F3 10 Tf 0.85 0.85 0.85 rg 60 626 Td (Repository-Only Implementation | All Secrets Redacted) Tj ET',
    'q 1 1 1 RG 0.5 w 60 610 m 535 610 l S Q',
    'BT /F4 12 Tf 0.95 0.95 0.95 rg 60 580 Td (INCLUDED ARTIFACTS & IMPLEMENTATION FILES:) Tj ET'
  );

  let y = 550;
  filesToInclude.forEach((f) => {
    page.lines.push(
      `BT /F4 10 Tf 0.3 0.8 1 rg 60 ${y} Td (${f.index}. [${escapePdf(f.category)}]) Tj ET`,
      `BT /F4 10 Tf 1 1 1 rg 240 ${y} Td (${escapePdf(f.title)}) Tj ET`,
      `BT /F3 9 Tf 0.8 0.8 0.8 rg 75 ${y - 14} Td (Path: ${escapePdf(f.path)}) Tj ET`,
      `BT /F3 8.5 Tf 0.7 0.7 0.7 rg 75 ${y - 26} Td (${escapePdf(f.desc)}) Tj ET`
    );
    y -= 46;
  });

  page.lines.push(
    'q 0.15 0.22 0.38 rg 40 180 515 80 re f Q',
    'BT /F4 10 Tf 1 0.85 0.2 rg 55 238 Td (PHASE 5.1C-13 SECURITY HIGHLIGHTS:) Tj ET',
    'BT /F3 8.5 Tf 1 1 1 rg 55 222 Td (- Allowlist Wrapper: Enforces strict schema, canonical array execution, and single operation) Tj ET',
    'BT /F3 8.5 Tf 1 1 1 rg 55 210 Td (- Zero Egress & Mounts: Rejects --share-net and arbitrary mounts outside approved sandbox directories) Tj ET',
    'BT /F3 8.5 Tf 1 1 1 rg 55 198 Td (- Pre-Init Key Validation: Validates CORRELATION_KEY before allocating box or invoking isolate) Tj ET',
    'BT /F3 8.5 Tf 1 1 1 rg 55 186 Td (- Safe Process Exec & Errors: Open3.capture3 array execution; preserves original errors during cleanup failure) Tj ET'
  );

  // File rendering
  filesToInclude.forEach(fileInfo => {
    console.log(`Processing file: ${fileInfo.path}`);
    const fullPath = path.resolve(rootDir, fileInfo.path);
    if (!fs.existsSync(fullPath)) {
      console.warn(`File not found: ${fullPath}`);
      return;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const rawLines = content.split('\n');

    const lines = [];
    rawLines.forEach(l => {
      const sanitized = l.replace(/\r/g, '');
      const maxLen = 85;
      if (sanitized.length <= maxLen) {
        lines.push(sanitized);
      } else {
        let remaining = sanitized;
        while (remaining.length > maxLen) {
          lines.push(remaining.substring(0, maxLen));
          remaining = '  ' + remaining.substring(maxLen);
        }
        lines.push(remaining);
      }
    });

    const linesPerPage = 56;
    const numPages = Math.ceil(lines.length / linesPerPage) || 1;

    for (let p = 0; p < numPages; p++) {
      let page = doc.createPage();
      const startIdx = p * linesPerPage;
      const endIdx = Math.min(startIdx + linesPerPage, lines.length);
      const pageLines = lines.slice(startIdx, endIdx);

      // Header
      page.lines.push(
        'q 0.94 0.96 0.98 rg 40 790 515 32 re f Q',
        'q 0.2 0.4 0.7 RG 1 w 40 790 m 555 790 l S Q',
        `BT /F4 10 Tf 0.1 0.2 0.4 rg 45 806 Td (${fileInfo.index}. ${escapePdf(fileInfo.title)}) Tj ET`,
        `BT /F3 8 Tf 0.4 0.4 0.4 rg 45 795 Td (${escapePdf(fileInfo.path)}  [${fileInfo.category}] - Part ${p + 1}/${numPages}) Tj ET`
      );

      // Content Box
      page.lines.push(
        'q 0.98 0.98 0.98 rg 40 45 515 735 re f Q',
        'q 0.85 0.85 0.85 RG 0.5 w 40 45 515 735 re S Q'
      );

      let textY = 765;
      for (const line of pageLines) {
        let isHeading = false;
        let isDiffAdd = false;
        let isDiffSub = false;
        let isComment = false;

        if (line.startsWith('#') || line.startsWith('===')) isHeading = true;
        if (line.startsWith('+') && !line.startsWith('+++')) isDiffAdd = true;
        if (line.startsWith('-') && !line.startsWith('---')) isDiffSub = true;
        if (line.trim().startsWith('#') || line.trim().startsWith('//')) isComment = true;

        if (isHeading) {
          page.lines.push(`BT /F2 8.5 Tf 0.1 0.25 0.55 rg 48 ${textY} Td (${escapePdf(line)}) Tj ET`);
        } else if (isDiffAdd) {
          page.lines.push(`BT /F1 8.5 Tf 0.05 0.5 0.1 rg 48 ${textY} Td (${escapePdf(line)}) Tj ET`);
        } else if (isDiffSub) {
          page.lines.push(`BT /F1 8.5 Tf 0.7 0.1 0.1 rg 48 ${textY} Td (${escapePdf(line)}) Tj ET`);
        } else if (isComment) {
          page.lines.push(`BT /F1 8.5 Tf 0.4 0.4 0.4 rg 48 ${textY} Td (${escapePdf(line)}) Tj ET`);
        } else {
          page.lines.push(`BT /F1 8.5 Tf 0.15 0.15 0.15 rg 48 ${textY} Td (${escapePdf(line)}) Tj ET`);
        }
        textY -= 13;
      }
    }
  });

  const pdfBuf = doc.buildPDF();
  const outputPath = path.resolve(rootDir, 'TestForge_Phase5.1C-13_Remediation_Bundle.pdf');
  fs.writeFileSync(outputPath, pdfBuf);
  console.log(`Saved bundle PDF to ${outputPath} (${pdfBuf.length} bytes)`);

  const brainDir = 'C:\\Users\\LENOVO\\.gemini\\antigravity\\brain\\b4e9a2ec-3a8d-47b7-b150-134b7a0e3947';
  if (fs.existsSync(brainDir)) {
    const brainPath = path.join(brainDir, 'TestForge_Phase5.1C-13_Remediation_Bundle.pdf');
    fs.writeFileSync(brainPath, pdfBuf);
    console.log(`Also copied bundle PDF to brain directory: ${brainPath}`);
  }
}

generateBundle();
