export const splitCppParams = (paramsStr) => {
  const parts = [];
  let current = '';
  let angleDepth = 0;
  for (const ch of paramsStr) {
    if (ch === '<') angleDepth++;
    else if (ch === '>') angleDepth--;
    else if (ch === ',' && angleDepth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

export const parseCppParams = (paramsStr) => {
  if (!paramsStr || !paramsStr.trim()) return [];
  return splitCppParams(paramsStr).map((p, i) => {
    let cleaned = p.replace(/\bconst\b/g, '').replace(/&/g, '').replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/\s*\*\s*/g, '* ');
    const lastSpace = cleaned.lastIndexOf(' ');
    if (lastSpace === -1) return { type: cleaned, name: `arg${i}` };
    const type = cleaned.slice(0, lastSpace).trim();
    const name = cleaned.slice(lastSpace + 1).trim();
    return { type, name };
  });
};

export const extractCppFunctionInfo = (code) => {
  if (!code || typeof code !== 'string') return null;
  const funcRegex = /(?:static\s+|virtual\s+|inline\s+)?([\w][\w\s:<>,*&]*?)\s*(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?\s*\{/g;
  let match;
  while ((match = funcRegex.exec(code)) !== null) {
    const rawReturnType = match[1].trim();
    const returnType = rawReturnType.replace(/^(?:public|protected|private)\s*:\s*/i, '').trim();
    const funcName   = match[2].trim();
    const paramsStr  = match[3].trim();
    if (['Solution', 'main', 'class', 'struct', 'if', 'for', 'while', 'switch'].includes(funcName)) continue;
    if (returnType === 'class' || returnType === 'struct') continue;
    const params = parseCppParams(paramsStr);
    return { funcName, returnType, params };
  }
  return null;
};
