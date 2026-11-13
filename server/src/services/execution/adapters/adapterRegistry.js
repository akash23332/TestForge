import { ArrayAdapter } from './ArrayAdapter.js';
import { StringAdapter } from './StringAdapter.js';
import { LinkedListAdapter } from './LinkedListAdapter.js';
import { BinaryTreeAdapter } from './BinaryTreeAdapter.js';

const adapters = new Map();

const arrayAdapter = new ArrayAdapter();
const stringAdapter = new StringAdapter();
const linkedListAdapter = new LinkedListAdapter();
const binaryTreeAdapter = new BinaryTreeAdapter();

adapters.set('ARRAY', arrayAdapter);
adapters.set('NONE', arrayAdapter);
adapters.set('STRING', stringAdapter);
adapters.set('LINKED_LIST', linkedListAdapter);
adapters.set('BINARY_TREE', binaryTreeAdapter);

/**
 * Retrieves the adapter corresponding to a question's data structure.
 * Defaults cleanly to ArrayAdapter for backward compatibility.
 * @param {string} [dataStructure]
 * @returns {BaseAdapter}
 */
export const getAdapter = (dataStructure = 'ARRAY') => {
  if (!dataStructure || typeof dataStructure !== 'string') {
    return arrayAdapter;
  }
  const key = dataStructure.trim().toUpperCase();
  return adapters.get(key) || arrayAdapter;
};

export const registerAdapter = (name, adapterInstance) => {
  if (!name || !adapterInstance) {
    throw new Error('Adapter registration requires name and instance');
  }
  adapters.set(name.trim().toUpperCase(), adapterInstance);
};

export const getRegisteredAdapters = () => Array.from(adapters.keys());

export default {
  getAdapter,
  registerAdapter,
  getRegisteredAdapters,
  arrayAdapter,
  stringAdapter,
  linkedListAdapter,
  binaryTreeAdapter
};
