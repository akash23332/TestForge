/**
 * BaseAdapter
 * Abstract base class for data-structure-aware execution adapters.
 */
export class BaseAdapter {
  constructor(name) {
    if (!name) throw new Error('Adapter must have a name');
    this.name = name;
  }

  /**
   * Returns language-specific type definitions (e.g. struct ListNode).
   * @param {string} language - 'cpp' | 'java' | 'python' | 'javascript'
   * @param {object} options
   * @returns {string}
   */
  getTypeDeclarations(language, options = {}) {
    return '';
  }

  /**
   * Returns code/logic to parse input from stdin/args into native data structure.
   * @param {string} language
   * @param {object} param - { name, type }
   * @param {number} index
   * @returns {string}
   */
  getInputParser(language, param, index) {
    return '';
  }

  /**
   * Returns code/logic to serialize and print output.
   * @param {string} language
   * @param {string} returnType
   * @returns {string}
   */
  getResultPrinter(language, returnType = 'void') {
    return '';
  }

  /**
   * Normalizes output before test case comparison.
   * @param {any} output
   * @returns {any}
   */
  normalizeOutput(output) {
    if (output === null || output === undefined) return null;
    if (typeof output === 'string') {
      const trimmed = output.trim();
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    return output;
  }

  /**
   * Generates a starter template for this data structure.
   */
  getStarterTemplate(language, functionName = 'solution', parameters = [], returnType = 'void') {
    return '';
  }
}

export default BaseAdapter;
