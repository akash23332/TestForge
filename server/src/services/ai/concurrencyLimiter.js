import { ApiError } from '../../utils/apiError.js';

export class ConcurrencyLimiter {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxConcurrent=2] - Maximum active in-flight requests
   * @param {number} [options.queueTimeoutMs=25000] - Max time a queued request waits for a slot
   * @param {string} [options.name='GeminiConcurrencyLimiter']
   */
  constructor(options = {}) {
    this.name = options.name || 'GeminiConcurrencyLimiter';
    this.maxConcurrent = options.maxConcurrent || 2;
    this.queueTimeoutMs = options.queueTimeoutMs || 25000;

    this.activeCount = 0;
    this._queue = [];
  }

  /**
   * Acquires a concurrency slot. Resolves to a release callback.
   * If all slots are busy, queues until one frees or timeout expires.
   * @returns {Promise<Function>} release function
   */
  async acquire() {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      return this._createRelease();
    }

    // Slots exhausted, queue with timeout
    return new Promise((resolve, reject) => {
      let timer = null;

      const item = {
        resolve: (releaseFn) => {
          if (timer) clearTimeout(timer);
          resolve(releaseFn);
        },
        reject: (err) => {
          if (timer) clearTimeout(timer);
          reject(err);
        }
      };

      timer = setTimeout(() => {
        // Remove item from queue
        const idx = this._queue.indexOf(item);
        if (idx !== -1) {
          this._queue.splice(idx, 1);
        }
        item.reject(
          ApiError.tooManyRequests(
            'AI service is busy handling other faculty requests. Please wait a moment before trying again.',
            { code: 'GEMINI_CONCURRENCY_EXCEEDED', queueTimeoutMs: this.queueTimeoutMs }
          )
        );
      }, this.queueTimeoutMs);

      this._queue.push(item);
    });
  }

  _createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeCount = Math.max(0, this.activeCount - 1);

      // Dequeue next waiting request if available
      if (this._queue.length > 0 && this.activeCount < this.maxConcurrent) {
        this.activeCount++;
        const next = this._queue.shift();
        next.resolve(this._createRelease());
      }
    };
  }

  /**
   * Snapshot of active and queued requests.
   */
  getStatus() {
    return {
      name: this.name,
      activeCount: this.activeCount,
      queuedCount: this._queue.length,
      maxConcurrent: this.maxConcurrent
    };
  }
}

// Global default singleton
export const geminiConcurrencyLimiter = new ConcurrencyLimiter({
  maxConcurrent: 2,
  queueTimeoutMs: 25000
});
