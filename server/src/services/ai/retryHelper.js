/**
 * Determines whether an error is transient and eligible for retry.
 */
export function isTransientError(error) {
  if (!error) return false;

  const status = error.status || error.statusCode || error.response?.status;
  const msg = (error.message || '').toLowerCase();
  const code = (error.code || error.details?.code || '').toLowerCase();
  const name = (error.name || '').toLowerCase();

  // Non-retryable client errors unless they explicitly mention high demand or resource exhaustion
  if ((status === 400 || status === 401 || status === 403 || status === 404 || status === 422) &&
      !msg.includes('high demand') && !msg.includes('resource_exhausted')) {
    return false;
  }

  // Transient HTTP status codes
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  // Transient message indicators, aborts & socket errors
  if (
    name === 'aborterror' ||
    msg.includes('aborted') ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('timeout') ||
    msg.includes('deadline_exceeded') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    code.includes('service_unavailable') ||
    code.includes('rate_limit') ||
    code.includes('timeout')
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts Retry-After delay in milliseconds if provided by the error/headers.
 * @param {Error|Object} error
 * @returns {number|null} delay in ms or null
 */
export function extractRetryAfterMs(error) {
  if (!error) return null;

  // Check custom details or headers
  const retryHeader =
    error.response?.headers?.['retry-after'] ||
    error.headers?.['retry-after'] ||
    error.details?.retryAfterSec;

  if (retryHeader) {
    const parsedSec = parseFloat(retryHeader);
    if (!isNaN(parsedSec) && parsedSec > 0) {
      return Math.min(Math.round(parsedSec * 1000), 10000); // Bounded to max 10s
    }
  }

  if (error.details?.retryAfterMs) {
    return Math.min(Number(error.details.retryAfterMs), 10000);
  }

  return null;
}

/**
 * Calculates exponential backoff delay with randomized jitter.
 * @param {number} attemptIndex - 0 for first retry, 1 for second retry, etc.
 * @param {Object} [options]
 * @param {number} [options.baseDelayMs=1000]
 * @param {number} [options.maxDelayMs=10000]
 * @param {number} [options.jitterRatio=0.3] - ±30% random jitter
 * @returns {number} delay in ms
 */
export function calculateBackoffWithJitter(attemptIndex, options = {}) {
  const baseDelayMs = options.baseDelayMs || 1000;
  const maxDelayMs = options.maxDelayMs || 10000;
  const jitterRatio = options.jitterRatio ?? 0.3;

  // Exponential step: 1000 * 2^attemptIndex (1000ms, 2000ms, 4000ms)
  const expDelay = baseDelayMs * Math.pow(2, attemptIndex);
  const boundedDelay = Math.min(expDelay, maxDelayMs);

  // Full random jitter within ±jitterRatio
  const jitterRange = boundedDelay * jitterRatio;
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  const finalDelay = Math.max(200, Math.round(boundedDelay + jitter));

  return Math.min(finalDelay, maxDelayMs);
}

/**
 * Executes a function with bounded exponential backoff and randomized jitter.
 * Supports model fallback switching during retries.
 */
export async function executeWithRetry(operation, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  const onRetry = options.onRetry || null;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      const transient = isTransientError(err);

      if (!transient || attempt >= maxRetries) {
        throw err;
      }

      // Determine backoff delay
      const retryAfterMs = extractRetryAfterMs(err);
      const delayMs = retryAfterMs || calculateBackoffWithJitter(attempt, options);

      if (typeof onRetry === 'function') {
        onRetry({
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          error: err,
          transient
        });
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
