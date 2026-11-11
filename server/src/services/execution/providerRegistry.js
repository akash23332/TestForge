import { MockExecutionProvider } from './MockExecutionProvider.js';
import { LocalExecutionProvider } from './LocalExecutionProvider.js';
import { RenderSandboxProvider } from './RenderSandboxProvider.js';
import { config } from '../../config/env.js';
import { setExecutionRegistry } from '../codeRunner.service.js';

class ExecutionProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.activeProviderName = 'local';
    this.activeProviderInstance = null;

    // Register built-in providers
    this.register('mock', new MockExecutionProvider());
    this.register('render_sandbox', new RenderSandboxProvider());

    const allowLocal = config.execution?.allowLocalExecution || process.env.ALLOW_LOCAL_EXECUTION === 'true' || config.env === 'test';
    if (config.env !== 'production' && process.env.NODE_ENV !== 'production' && allowLocal) {
      this.register('local', new LocalExecutionProvider({ allowLocalExecution: true }));
    }

    // Select initial provider from configuration (defaults to mock in Phase 3)
    const configuredProvider = config.execution?.provider || 'mock';
    this.setActiveProvider(configuredProvider);
  }

  /**
   * Registers a new execution provider implementation.
   * @param {string} name
   * @param {import('./ExecutionProvider.interface.js').ExecutionProvider} provider
   */
  register(name, provider) {
    this.providers.set(name.toLowerCase(), provider);
  }

  /**
   * Sets the active provider by name or instance.
   * Enforces security: never falls back to local in production, and throws if provider is unknown.
   * @param {string|import('./ExecutionProvider.interface.js').ExecutionProvider} providerOrName
   */
  setActiveProvider(providerOrName) {
    if (typeof providerOrName === 'string') {
      const name = providerOrName.toLowerCase();
      if (name === 'local' && (config.env === 'production' || process.env.NODE_ENV === 'production')) {
        throw new Error('[ExecutionRegistry] Refusing to initialize LocalExecutionProvider in production. Must use mock or isolated render_sandbox.');
      }
      const provider = this.providers.get(name);
      if (!provider) {
        throw new Error(
          `[ExecutionRegistry] Unknown execution provider '${providerOrName}'. ` +
          `Available: [${Array.from(this.providers.keys()).join(', ')}]. No automatic fallback to local permitted.`
        );
      }
      this.activeProviderName = name;
      this.activeProviderInstance = provider;
    } else if (providerOrName && typeof providerOrName.executeCode === 'function') {
      if (providerOrName.name === 'local' && (config.env === 'production' || process.env.NODE_ENV === 'production')) {
        throw new Error('[ExecutionRegistry] Refusing to initialize LocalExecutionProvider in production.');
      }
      this.activeProviderName = providerOrName.name || 'custom';
      this.activeProviderInstance = providerOrName;
    } else {
      throw new Error('[ExecutionRegistry] Invalid provider object or name provided to setActiveProvider.');
    }
  }

  /**
   * Returns the currently active execution provider, or a named provider.
   * @param {string} [name]
   * @returns {import('./ExecutionProvider.interface.js').ExecutionProvider}
   */
  getProvider(name) {
    if (name) {
      const p = this.providers.get(name.toLowerCase());
      if (!p) {
        throw new Error(`[ExecutionRegistry] Provider not found: ${name}`);
      }
      return p;
    }
    if (!this.activeProviderInstance) {
      this.activeProviderInstance = this.providers.get('mock');
    }
    return this.activeProviderInstance;
  }

  /**
   * Returns capabilities of all registered providers.
   */
  listCapabilities() {
    const list = {};
    for (const [name, provider] of this.providers.entries()) {
      list[name] = provider.getCapabilities();
    }
    return list;
  }
}

export const providerRegistry = new ExecutionProviderRegistry();
setExecutionRegistry(providerRegistry);
export default providerRegistry;
