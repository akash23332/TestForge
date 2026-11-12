import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const filesToInclude = [
  {
    index: 1,
    title: 'Phase 5.1C-10 Implementation & Verification Report',
    path: 'PHASE_5_1C_10_IMPLEMENTATION_REPORT.md',
    category: 'IMPLEMENTATION & AUDIT REPORT',
    desc: 'Structured execution correlation architecture, lifecycle analysis, HMAC-SHA256 telemetry design, and regression verification.'
  },
  {
    index: 2,
    title: 'Judge0 IsolateJob Correlation Patch',
    path: 'deploy/judge0/docker/patches/isolate_job_correlation.patch',
    category: 'GIT UNIFIED DIFF PATCH',
    desc: 'Reproducible patch hooking into IsolateJob#initialize_workdir and #cleanup emitting [CORRELATION] with HMAC token hash.'
  },
  {
    index: 3,
    title: 'Judge0 ARM64 Custom Dockerfile',
    path: 'deploy/judge0/docker/Dockerfile.judge0-arm64',
    category: 'CONTAINER BUILD SPECIFICATION',
    desc: 'Multi-stage build applying the correlation patch and verifying telemetry signature during container build, failing closed on discrepancy.'
  },
  {
    index: 4,
    title: 'Host Resource & Cgroup Accounting Probe',
    path: 'deploy/judge0/verify-resource-accounting.sh',
    category: 'SHELL SCRIPT (BASH)',
    desc: 'HMAC-SHA256 token hashing, [CORRELATION] log parser, stale execution rejection, single-candidate validation, and cgroup PID verification.'
  },
  {
    index: 5,
    title: 'Phase 5.1C-10 Correlation Regression Suite',
    path: 'server/tests/phase51C10Correlation.test.js',
    category: 'JAVASCRIPT (JEST ESM)',
    desc: 'Complete 17-test regression suite covering patch integrity, Dockerfile verification, and all 14 required failure/simulation scenarios.'
  }
];

function escapePdf(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
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
    let objects = [];
    const addObject = (content) => {
      const id = objects.length + 1;
      objects.push({ id, content });
      return id;
    };

    const f1Id = addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`);
    const f2Id = addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>`);
    const f3Id = addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
    const f4Id = addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);

    const totalPages = this.pages.length;
    const pageObjIds = [];
    for (let i = 0; i < totalPages; i++) {
      pageObjIds.push(objects.length + 1 + i * 2);
    }

    const pagesCatalogId = objects.length + totalPages * 2 + 1;

    for (let i = 0; i < totalPages; i++) {
      const page = this.pages[i];
      const pageNumber = i + 1;

      const footerText = `TestForge Phase 5.1C-10 Correlation Bundle | Page ${pageNumber} of ${totalPages}`;
      page.lines.push(
        'q 0.7 0.7 0.7 RG 0.5 w 40 32 m 555 32 l S Q',
        `BT /F3 8 Tf 0.4 0.4 0.4 rg 40 22 Td (${escapePdf(footerText)}) Tj ET`,
        `BT /F4 8 Tf 0.1 0.4 0.8 rg 460 22 Td (CORRELATION HARDENED) Tj ET`
      );

      const streamContent = page.lines.join('\n');
      const streamLen = Buffer.byteLength(streamContent, 'utf8');

      const streamObjId = addObject(`<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream`);
      addObject(`<< /Type /Page /Parent ${pagesCatalogId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${f1Id} 0 R /F2 ${f2Id} 0 R /F3 ${f3Id} 0 R /F4 ${f4Id} 0 R >> >> /Contents ${streamObjId} 0 R >>`);
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
  console.log('Starting Phase 5.1C-10 PDF generation...');
  const doc = new PDFBuilder();

  // Cover Page
  let page = doc.createPage();
  page.lines.push(
    'q 0.05 0.12 0.28 rg 0 0 595 842 re f Q',
    'q 0.12 0.35 0.65 rg 40 700 515 90 re f Q',
    'BT /F4 22 Tf 1 1 1 rg 60 745 Td (TESTFORGE AUDIT & VERIFICATION) Tj ET',
    'BT /F4 14 Tf 0.85 0.92 1 rg 60 720 Td (Phase 5.1C-10: Judge0 Structured Execution Correlation) Tj ET',
    'BT /F4 11 Tf 1 1 1 rg 60 660 Td (OFFICIAL IMPLEMENTATION ARTIFACT BUNDLE) Tj ET',
    'BT /F3 10 Tf 0.85 0.85 0.85 rg 60 642 Td (Date: November 12, 2026 | Environment: ARM64 Ubuntu 22.04 LTS / cgroups v1) Tj ET',
    'BT /F3 10 Tf 0.85 0.85 0.85 rg 60 626 Td (Repository-Only Implementation | Upstream Blocker Resolution) Tj ET',
    'q 1 1 1 RG 0.5 w 60 610 m 535 610 l S Q',
    'BT /F4 12 Tf 0.95 0.95 0.95 rg 60 580 Td (INCLUDED VERIFICATION & SOURCE ARTIFACTS:) Tj ET'
  );

  let y = 550;
  filesToInclude.forEach((f) => {
    page.lines.push(
      `BT /F4 10 Tf 0.3 0.8 1 rg 60 ${y} Td (${f.index}. [${escapePdf(f.category)}]) Tj ET`,
      `BT /F4 10 Tf 1 1 1 rg 240 ${y} Td (${escapePdf(f.title)}) Tj ET`,
      `BT /F3 9 Tf 0.8 0.8 0.8 rg 75 ${y - 14} Td (Path: ${escapePdf(f.path)}) Tj ET`,
      `BT /F3 8.5 Tf 0.7 0.7 0.7 rg 75 ${y - 26} Td (${escapePdf(f.desc)}) Tj ET`
    );
    y -= 48;
  });

  page.lines.push(
    'q 0.15 0.22 0.38 rg 40 180 515 80 re f Q',
    'BT /F4 10 Tf 1 0.85 0.2 rg 55 238 Td (SECURITY & BOUNDARY ENFORCEMENT SUMMARY:) Tj ET',
    'BT /F3 8.5 Tf 1 1 1 rg 55 222 Td (- Upstream Blocker Resolved: Implemented structured opaque correlation in Judge0 source) Tj ET',
    'BT /F3 8.5 Tf 1 1 1 rg 55 210 Td (- Credential Protection: submission.token never logged; HMAC-SHA256 token_hash emitted) Tj ET',
    'BT /F3 8.5 Tf 1 1 1 rg 55 198 Td (- Disambiguation: Unique execution_id generated per attempt; stale and conflicting logs rejected) Tj ET',
    'BT /F3 8.5 Tf 1 1 1 rg 55 186 Td (- Zero Cloud Footprint: Repository-only; zero Azure, SSH, Docker builds, or student code execution) Tj ET'
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
  const outputPath = path.resolve(rootDir, 'TestForge_Phase5.1C-10_Correlation_Bundle.pdf');
  fs.writeFileSync(outputPath, pdfBuf);
  console.log(`Saved bundle PDF to ${outputPath} (${pdfBuf.length} bytes)`);

  const brainDir = 'C:\\Users\\LENOVO\\.gemini\\antigravity\\brain\\b4e9a2ec-3a8d-47b7-b150-134b7a0e3947';
  if (fs.existsSync(brainDir)) {
    const brainPath = path.join(brainDir, 'TestForge_Phase5.1C-10_Correlation_Bundle.pdf');
    fs.writeFileSync(brainPath, pdfBuf);
    console.log(`Also copied bundle PDF to brain directory: ${brainPath}`);
  }
}

generateBundle();
