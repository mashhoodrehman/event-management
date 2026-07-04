/**
 * Simple retry wrapper for async functions (like axios calls)
 * @param {Function} fn - The async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.retries - Number of retries (default 5)
 * @param {number} options.delay - Initial delay in ms (default 5000)
 * @param {number} options.factor - Exponential backoff factor (default 2)
 * @returns {Promise<any>}
 */
async function withRetry(fn, { retries = 5, delay = 5000, factor = 2 } = {}) {
    let lastError;
    let currentDelay = delay;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Determine if error is retryable (DNS, Timeout, 5xx)
            const isDnsError = error.code === 'EAI_AGAIN' || error.code === 'ENOTFOUND';
            const isTimeout = error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED';
            const is5xx = error.response && error.response.status >= 500;

            const shouldRetry = isDnsError || isTimeout || is5xx;

            if (attempt < retries && shouldRetry) {
                console.warn(`[Retry] Attempt ${attempt + 1} failed (${error.code || error.message}). Retrying in ${currentDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                currentDelay *= factor;
            } else {
                throw lastError;
            }
        }
    }
}

module.exports = { withRetry };
