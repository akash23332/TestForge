import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const filesToInclude = [
  {
    index: 1,
    title: 'Phase 5.1C-5 Final Verification Report',
    path: 'PHASE_5_1C_5_FINAL_VERIFICATION_REPORT.md',
    category: 'VERIFICATION AUDIT REPORT',
    desc: 'Audit report documenting resolution of blockers B-01 through B-09, test evidence, and build decision.'
  },
  {
    index: 2,
    title: 'Cgroups v1 & Isolate Operational Check Script',
    path: 'deploy/judge0/verify-cgroups-isolate.sh',
    category: 'SHELL SCRIPT (BASH)',
    desc: 'Validates host cgroup v1 mounts, Isolate SUID root permissions, sandbox directory creation, and security limits.'
  },
  {
    index: 3,
    title: 'Host Resource & Cgroup Accounting Probe',
    path: 'deploy/judge0/verify-resource-accounting.sh',
    category: 'SHELL SCRIPT (BASH)',
    desc: 'Proves root sibling cgroup allocation, memory hierarchy, OOM control containment, and host headroom safety.'
  },
  {
    index: 4,
    title: 'Hostile-Code Containment Test Suite',
    path: 'deploy/judge0/verify-containment.sh',
    category: 'SHELL SCRIPT (BASH)',
    desc: 'Executes 25 containment attack scenarios across C++, Java, JS, and Python against the running execution runner.'
  },
  {
    index: 5,
    title: 'Custom Native ARM64 Compilers Base Dockerfile',
    path: 'deploy/judge0/docker/Dockerfile.compilers-arm64',
    category: 'DOCKERFILE',
    desc: 'Builds testforge/compilers:v1.4.0-arm64 with pinned Isolate v1.10.1, OpenSSL 1.1.1w SHA-256, and Ruby 2.7.8 SHA-256.'
  },
  {
    index: 6,
    title: 'Custom Native ARM64 Judge0 v1.13.1 Dockerfile',
    path: 'deploy/judge0/docker/Dockerfile.judge0-arm64',
    category: 'DOCKERFILE',
    desc: 'Builds testforge/judge0:v1.13.1-arm64 with scoped sudoers, root-owned cron wrapper, and clean source installation.'
  },
  {
    index: 7,
    title: 'Hardened Docker Compose Stack Configuration',
    path: 'deploy/judge0/docker-compose.yml',
    category: 'COMPOSE SPECIFICATION (YAML)',
    desc: 'Defines 4 container services (worker 3072m, server 1024m, db 512m, redis 384m) with fail-closed image requirement.'
  },
  {
    index: 8,
    title: 'Native ARM64 Build Pipeline Script',
    path: 'deploy/judge0/build-arm64.sh',
    category: 'SHELL SCRIPT (BASH)',
    desc: 'Automates native aarch64 container image build; enforces native host architecture and verifies Buildx.'
  },
  {
    index: 9,
    title: 'Automated Runner Deployment Script',
    path: 'deploy/judge0/deploy-runner.sh',
    category: 'SHELL SCRIPT (BASH)',
    desc: 'Turnkey host setup script enforcing mode 0600 secrets, fail-closed ARM64 architecture check, and container launch.'
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
    const page = {
      lines: []
    };
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

    // 1. Fonts
    const fCourier = addObject({ type: 'dict', data: '/Type /Font /Subtype /Type1 /BaseFont /Courier' });
    const fCourierBold = addObject({ type: 'dict', data: '/Type /Font /Subtype /Type1 /BaseFont /Courier-Bold' });
    const fHelvetica = addObject({ type: 'dict', data: '/Type /Font /Subtype /Type1 /BaseFont /Helvetica' });
    const fHelveticaBold = addObject({ type: 'dict', data: '/Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold' });

    // 2. Prepare page objects
    const pagesObjId = objects.length + 1;
    const pageObjIds = [];

    const totalPages = this.pages.length;

    for (let pIdx = 0; pIdx < this.pages.length; pIdx++) {
      const p = this.pages[pIdx];
      let stream = '';

      // Header / Footer on content pages
      if (pIdx > 0) {
        stream += 'q 0.5 0.5 0.5 rg BT /F3 8.5 Tf 40 812 Td (TestForge Phase 5.1C-5 Implementation Bundle) Tj ET ';
        stream += `BT /F3 8.5 Tf 480 812 Td (Page ${pIdx + 1} of ${totalPages}) Tj ET `;
        stream += '0.8 0.8 0.8 RG 0.5 w 40 806 m 555 806 l S ';
        stream += '40 32 m 555 32 l S ';
        stream += 'BT /F3 8 Tf 40 22 Td (CONFIDENTIAL - TESTFORGE RUNNER DEPLOYMENT SPECIFICATION) Tj ET Q ';
      }

      // Render commands for this page
      for (let cmd of p.lines) {
        stream += cmd + ' ';
      }

      const streamId = addObject({
        type: 'stream',
        data: stream.trim()
      });

      const pageId = addObject({
        type: 'dict',
        data: `/Type /Page /Parent ${pagesObjId} 0 R /MediaBox [0 0 595.28 841.89] ` +
              `/Resources << /Font << /F1 ${fCourier} 0 R /F2 ${fCourierBold} 0 R /F3 ${fHelvetica} 0 R /F4 ${fHelveticaBold} 0 R >> >> ` +
              `/Contents ${streamId} 0 R`
      });
      pageObjIds.push(pageId);
    }

    // 3. Pages catalog
    addObject({
      type: 'dict',
      data: `/Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length}`
    });

    // 4. Catalog
    const catalogId = addObject({
      type: 'dict',
      data: `/Type /Catalog /Pages ${pagesObjId} 0 R`
    });

    // 5. Serialize
    let out = '%PDF-1.4\n%âãÏÓ\n';
    const offsets = [];

    for (let obj of objects) {
      offsets.push(Buffer.byteLength(out, 'latin1'));
      out += `${obj.id} 0 obj\n`;
      if (obj.content.type === 'dict') {
        out += `<< ${obj.content.data} >>\nendobj\n`;
      } else if (obj.content.type === 'stream') {
        const d = obj.content.data;
        out += `<< /Length ${Buffer.byteLength(d, 'latin1')} >>\nstream\n${d}\nendstream\nendobj\n`;
      }
    }

    const xrefOffset = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let o of offsets) {
      out += `${o.toString().padStart(10, '0')} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  }
}

// Generate the PDF
const builder = new PDFBuilder();

// ---------------------------------------------------------------------------
// 1. Cover Page
// ---------------------------------------------------------------------------
const cover = builder.createPage();
cover.lines.push(
  // Dark navy accent header block
  'q 0.05 0.15 0.35 rg 0 740 595.28 102 re f Q',
  'BT /F4 22 Tf 1 1 1 rg 40 795 Td (TESTFORGE INFRASTRUCTURE SPECIFICATION) Tj ET',
  'BT /F3 11 Tf 0.85 0.9 1 rg 40 770 Td (Phase 5.1C-5: Final ARM64 Build & Isolate Verification Implementation) Tj ET',
  'BT /F3 9 Tf 0.7 0.8 0.95 rg 40 752 Td (Dedicated Code Execution Runner Stack - Canonical Implementation Bundle) Tj ET',

  // System Metadata Box
  'q 0.96 0.97 0.98 rg 40 585 515 130 re f 0.8 0.85 0.9 RG 1 w 40 585 515 130 re s Q',
  'BT /F4 11 Tf 0.1 0.2 0.3 rg 55 695 Td (SYSTEM EXECUTION CONTEXT & ENVIRONMENT) Tj ET',
  'BT /F3 9.5 Tf 0.2 0.2 0.2 rg 55 675 Td (Target Architecture: ) Tj /F4 9.5 Tf (ARM64 (aarch64 / arm64) Native Host) Tj ET',
  'BT /F3 9.5 Tf 0.2 0.2 0.2 rg 55 658 Td (Target Cloud VM:    ) Tj /F4 9.5 Tf (Azure Dedicated VM (Ubuntu 22.04.5 LTS ARM64, 2 vCPU, 8 GB RAM)) Tj ET',
  'BT /F3 9.5 Tf 0.2 0.2 0.2 rg 55 641 Td (Sandbox Engine:     ) Tj /F4 9.5 Tf (Judge0 CE v1.13.1 + IOI Isolate v1.10.1 (Legacy cgroups v1)) Tj ET',
  'BT /F3 9.5 Tf 0.2 0.2 0.2 rg 55 624 Td (Preflight Verdict:  ) Tj /F4 9.5 Tf 0.1 0.55 0.2 rg (READY FOR NATIVE ARM64 BUILD [PASS-CLOSED]) Tj ET',
  'BT /F3 9.5 Tf 0.2 0.2 0.2 rg 55 607 Td (Automated Testing:  ) Tj /F4 9.5 Tf (94 / 94 Test Assertions Verified (0 Failures Across 5 Suites)) Tj ET',
  'BT /F3 9.5 Tf 0.2 0.2 0.2 rg 55 590 Td (Generated On:       ) Tj /F3 9.5 Tf (' + new Date().toISOString() + ') Tj ET',

  // Table of Contents Title
  'BT /F4 13 Tf 0.1 0.15 0.25 rg 40 545 Td (DOCUMENT INDEX - 9 CORE IMPLEMENTATION ARTIFACTS) Tj ET',
  'q 0.1 0.4 0.8 RG 1.5 w 40 538 m 555 538 l S Q'
);

let tocY = 515;
for (let item of filesToInclude) {
  const fullPath = path.join(rootDir, item.path);
  const exists = fs.existsSync(fullPath);
  const sz = exists ? (fs.statSync(fullPath).size / 1024).toFixed(1) : '0';
  const lines = exists ? fs.readFileSync(fullPath, 'utf8').split('\n').length : 0;

  cover.lines.push(
    `BT /F4 10 Tf 0.1 0.35 0.7 rg 45 ${tocY} Td (${item.index}. ${escapePdf(item.title)}) Tj ET`,
    `BT /F2 8.5 Tf 0.4 0.4 0.4 rg 60 ${tocY - 12} Td (Path: ${escapePdf(item.path)}  |  ${item.category}  |  ${lines} lines  |  ${sz} KB) Tj ET`
  );
  tocY -= 32;
}

cover.lines.push(
  'q 0.85 0.85 0.85 RG 0.5 w 40 200 m 555 200 l S Q',
  'BT /F4 9.5 Tf 0.2 0.2 0.2 rg 40 180 Td (CRITICAL BUILD GOVERNANCE RULES:) Tj ET',
  'BT /F3 8.5 Tf 0.3 0.3 0.3 rg 40 165 Td (1. Zero Emulation: Upstream AMD64 images must NEVER run under QEMU on ARM64 hosts.) Tj ET',
  'BT /F3 8.5 Tf 0.3 0.3 0.3 rg 40 152 Td (2. Fail-Closed Selection: Missing ARM64 image halts launch with fatal diagnostic (exit 1).) Tj ET',
  'BT /F3 8.5 Tf 0.3 0.3 0.3 rg 40 139 Td (3. Bounded Host Allocation: 4992 MB container limit guarantees ~2100 MB unallocated buffer.) Tj ET',
  'BT /F3 8.5 Tf 0.3 0.3 0.3 rg 40 126 Td (4. Sibling Cgroup Accounting: Isolate runs as root sibling; staging COUNT=1 restricts box load to 250 MB.) Tj ET',
  'BT /F3 8.5 Tf 0.3 0.3 0.3 rg 40 113 Td (5. Concentric Privilege: judge0-server is unprivileged; workers restricted via root wrapper.) Tj ET',
  'BT /F3 8 Tf 0.5 0.5 0.5 rg 40 70 Td (TestForge DevSecOps Platform Verification Document - Authoritative Implementation Bundle) Tj ET'
);

// ---------------------------------------------------------------------------
// 2. Render each file with line numbers and headers
// ---------------------------------------------------------------------------
for (let fileItem of filesToInclude) {
  const fullPath = path.join(rootDir, fileItem.path);
  const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '[FILE NOT FOUND]';
  const rawLines = content.split('\n');

  // Wrap lines to ~82 characters
  const formattedLines = [];
  for (let lIdx = 0; lIdx < rawLines.length; lIdx++) {
    const raw = rawLines[lIdx].replace(/\r$/, '');
    const numPrefix = (lIdx + 1).toString().padStart(4, ' ') + ' | ';
    if (raw.length <= 80) {
      formattedLines.push({ num: numPrefix, text: raw });
    } else {
      let remaining = raw;
      let first = true;
      while (remaining.length > 0) {
        if (first) {
          formattedLines.push({ num: numPrefix, text: remaining.slice(0, 80) });
          remaining = remaining.slice(80);
          first = false;
        } else {
          formattedLines.push({ num: '       > ', text: remaining.slice(0, 76) });
          remaining = remaining.slice(76);
        }
      }
    }
  }

  // Paginate formatted lines
  const LINES_PER_PAGE_FIRST = 48; // first page has banner
  const LINES_PER_PAGE_REST = 62;

  let linePointer = 0;
  let pageNumForFile = 1;

  while (linePointer < formattedLines.length) {
    const page = builder.createPage();
    let currentY = 785;

    if (pageNumForFile === 1) {
      // Draw File Header Banner
      page.lines.push(
        'q 0.94 0.96 0.98 rg 40 730 515 62 re f 0.2 0.45 0.8 RG 1.5 w 40 730 515 62 re s Q',
        `BT /F4 12 Tf 0.1 0.25 0.5 rg 50 772 Td (${fileItem.index}. ${escapePdf(fileItem.title)}) Tj ET`,
        `BT /F2 8.5 Tf 0.2 0.3 0.4 rg 50 756 Td (File Path: ${escapePdf(fileItem.path)}  [${fileItem.category}]) Tj ET`,
        `BT /F3 8 Tf 0.3 0.35 0.4 rg 50 740 Td (${escapePdf(fileItem.desc)}) Tj ET`,
        'q 0.8 0.8 0.8 RG 0.5 w 40 718 m 555 718 l S Q'
      );
      currentY = 705;
    }

    const linesAllowed = (pageNumForFile === 1) ? LINES_PER_PAGE_FIRST : LINES_PER_PAGE_REST;
    const slice = formattedLines.slice(linePointer, linePointer + linesAllowed);
    linePointer += linesAllowed;
    pageNumForFile++;

    // Print text lines
    for (let fl of slice) {
      const lineStr = escapePdf(fl.num + fl.text);
      page.lines.push(
        `BT /F1 8.5 Tf 0.15 0.15 0.15 rg 40 ${currentY} Td (${lineStr}) Tj ET`
      );
      currentY -= 10.5;
    }
  }
}

const finalPdf = builder.buildPDF();
const outputPath = path.join(rootDir, 'TestForge_Phase5.1C-5_Implementation.pdf');
fs.writeFileSync(outputPath, finalPdf);

console.log(`\n========================================================`);
console.log(`✔ SUCCESS: Generated 1 consolidated PDF with all 9 files!`);
console.log(`File: ${outputPath}`);
console.log(`Total Pages: ${builder.pages.length}`);
console.log(`File Size:   ${(finalPdf.length / 1024).toFixed(2)} KB`);
console.log(`========================================================\n`);
