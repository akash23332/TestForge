import crypto from 'crypto';

/**
 * Deterministic UTF-16 code-point comparison.
 */
function compareCodePoints(a, b) {
  const sa = String(a);
  const sb = String(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

/**
 * Unambiguous Tagged Canonicalizer.
 * Encodes all values into strictly-typed tuples: [TAG, PAYLOAD]
 * Tags:
 *  'N'   -> null
 *  'U'   -> undefined
 *  'H'   -> sparse array hole
 *  'B'   -> boolean (0 or 1)
 *  'Num' -> finite number (IEEE-754 normalized)
 *  'S'   -> string (CRLF normalized to LF)
 *  'D'   -> Date (ISO string)
 *  'A'   -> Array (list of tagged tuples)
 *  'M'   -> Map (sorted array of [stringKey, taggedValue])
 *  'O'   -> Object (sorted array of [stringKey, taggedValue])
 *
 * User objects are always tagged as 'O', preventing collision with internal tokens.
 */
export function canonicalizeTagged(val, seen = new Set()) {
  if (val === null) return ['N'];
  if (val === undefined) return ['U'];

  if (typeof val === 'boolean') return ['B', val ? 1 : 0];

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      throw new TypeError(`Cannot fingerprint execution specification: non-finite number encountered (${val})`);
    }
    return ['Num', Object.is(val, -0) ? 0 : val];
  }

  if (typeof val === 'string') {
    return ['S', val.replace(/\r\n/g, '\n')];
  }

  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) {
      throw new TypeError('Cannot fingerprint execution specification: invalid Date encountered');
    }
    return ['D', val.toISOString()];
  }

  if (typeof val === 'object') {
    if (seen.has(val)) {
      throw new TypeError('Cannot fingerprint execution specification: cyclic structure detected');
    }
    seen.add(val);

    try {
      if (val instanceof Map) {
        const sortedEntries = [];
        const seenKeys = new Set();

        for (const [k, v] of val.entries()) {
          if (typeof k !== 'string') {
            throw new TypeError(`Cannot fingerprint execution specification: Map key must be a string, got ${typeof k}`);
          }
          if (seenKeys.has(k)) {
            throw new TypeError(`Cannot fingerprint execution specification: Map key collision detected on '${k}'`);
          }
          seenKeys.add(k);
          sortedEntries.push([k, canonicalizeTagged(v, seen)]);
        }

        sortedEntries.sort(([k1], [k2]) => compareCodePoints(k1, k2));
        return ['M', sortedEntries];
      }

      if (Array.isArray(val)) {
        const len = val.length;
        const out = [];
        for (let i = 0; i < len; i++) {
          if (!(i in val)) {
            out.push(['H']); // Sparse hole
          } else {
            out.push(canonicalizeTagged(val[i], seen));
          }
        }
        return ['A', out];
      }

      // Plain Object Verification
      const proto = Object.getPrototypeOf(val);
      if (proto !== Object.prototype && proto !== null) {
        throw new TypeError(`Cannot fingerprint execution specification: unsupported object type (${val.constructor?.name || 'Unknown'})`);
      }

      if (Object.getOwnPropertySymbols(val).length > 0) {
        throw new TypeError('Cannot fingerprint execution specification: symbol-keyed properties are not supported');
      }

      const ownKeys = Object.getOwnPropertyNames(val).sort(compareCodePoints);
      const out = [];

      for (const key of ownKeys) {
        if (Object.prototype.hasOwnProperty.call(val, key)) {
          out.push([key, canonicalizeTagged(val[key], seen)]);
        }
      }

      return ['O', out];
    } finally {
      seen.delete(val);
    }
  }

  throw new TypeError(`Unsupported type for execution canonicalization: ${typeof val}`);
}

const WRAPPER_RUNTIME_VERSION = 'v1.4.0';

/**
 * Computes deterministic execution specification fingerprint for a Question.
 * Includes all wrapper, signature, comparator tolerances, and limits.
 */
export function computeExecutionFingerprint(question, executionOptions = {}) {
  const rawParams = question.functionSignature?.parameters || question.parameters || [];
  const normalizedParams = Array.isArray(rawParams)
    ? [...rawParams]
        .map((p) => ({
          name: p.name || '',
          type: p.type || 'any',
          order: Number(p.order) || 0
        }))
        .sort((a, b) => a.order - b.order)
    : [];

  const refSolutionsMap = question.referenceSolutions instanceof Map
    ? question.referenceSolutions
    : new Map(Object.entries(question.referenceSolutions || {}));

  const starterCodesMap = question.starterCodes instanceof Map
    ? question.starterCodes
    : new Map(Object.entries(question.starterCodes || {}));

  const canonicalTags = Array.isArray(question.tags)
    ? [...question.tags].map((t) => String(t)).sort(compareCodePoints)
    : [];

  const canonicalSpec = {
    wrapperRuntimeVersion: WRAPPER_RUNTIME_VERSION,
    language: String(question.language || 'javascript'),
    executionMode: String(question.executionMode || 'STDIN'),
    dataStructure: String(question.dataStructure || 'ARRAY'),
    functionName: String(question.functionName || 'solution'),
    returnType: String(question.functionSignature?.returnType || 'void'),
    parameters: normalizedParams,
    referenceSolution: question.referenceSolution || '',
    referenceSolutions: refSolutionsMap,
    starterCode: question.starterCode || '',
    starterCodes: starterCodesMap,
    comparator: {
      title: String(question.title || ''),
      tags: canonicalTags,
      absTolerance: Number(executionOptions.absTolerance ?? question.absTolerance ?? 1e-5),
      relTolerance: Number(executionOptions.relTolerance ?? question.relTolerance ?? 1e-5)
    },
    ioFormat: {
      inputFormat: String(question.inputFormat || ''),
      outputFormat: String(question.outputFormat || ''),
      constraints: String(question.constraints || '')
    },
    limits: {
      timeLimitMs: Number(question.timeLimitMs) || 5000,
      memoryLimitMb: Number(question.memoryLimitMb) || 128
    }
  };

  const taggedPayload = canonicalizeTagged(canonicalSpec);
  return crypto.createHash('sha256').update(JSON.stringify(taggedPayload)).digest('hex');
}

export default {
  canonicalizeTagged,
  computeExecutionFingerprint
};
