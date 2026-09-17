/**
 * @file formatError.js
 * Centralized Error Sanitization & User-Friendly Reason Provider
 * 
 * Ensures all technical errors, database codes, stack traces, and network exceptions
 * are gracefully masked and presented with clear, valid, human-friendly reasons.
 */

const TECHNICAL_PATTERNS = [
  /prisma/i,
  /p200\d/i,
  /p201\d/i,
  /p202\d/i,
  /p100\d/i,
  /sqlite/i,
  /postgres/i,
  /mysql/i,
  /syntaxerror/i,
  /typeerror/i,
  /referenceerror/i,
  /uncaught/i,
  /cannot read propert/i,
  /is not a function/i,
  /null is not/i,
  /undefined is not/i,
  /econnrefused/i,
  /econnreset/i,
  /etimedout/i,
  /network error/i,
  /request failed with status/i,
  /<!doctype/i,
  /<html/i,
  /at object\./i,
  /at async/i,
  /node_modules/i,
  /jwt expired/i,
  /invalid signature/i,
  /foreign key constraint/i,
  /unique constraint/i,
  /internal server error/i,
  /sql/i,
  /table\s+["']?[a-zA-Z0-9_]+["']?/i,
  /column\s+["']?[a-zA-Z0-9_]+["']?/i,
];

/**
 * Sanitizes any raw message string by checking for technical artifacts
 * and converting them into valid, user-facing explanations.
 */
export function sanitizeErrorMessage(rawMessage, fallback = 'Unable to complete this request. Please try again.') {
  if (!rawMessage || typeof rawMessage !== 'string') return fallback;

  const trimmed = rawMessage.trim();

  // If technical tokens, database errors, or stack traces are present
  for (const pattern of TECHNICAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      if (/network|econnrefused|econnreset|failed to fetch|can't reach database|cannot reach database|database server|unreachable|p1001|p1000|p1002/i.test(trimmed)) {
        return 'Unable to connect to the database or server. Please check your internet connection and try again.';
      }
      if (/jwt|token|signature|session/i.test(trimmed)) {
        return 'Your session has expired. Please sign in again to continue.';
      }
      // Check for true duplicate record or unique constraint violations, ignoring function names like findUnique()
      if (/(unique constraint|duplicate key|already exists|p2002)/i.test(trimmed) && !/findunique/i.test(trimmed)) {
        return 'An item or account with these details is already registered.';
      }
      if (/not found|p2025/i.test(trimmed)) {
        return 'The requested record or item could not be found.';
      }
      if (/timeout|etimedout/i.test(trimmed)) {
        return 'The server took too long to respond. Please try again in a moment.';
      }
      return 'A server issue occurred while processing your request. Please try again shortly.';
    }
  }

  // Capitalize first letter and ensure clean sentence structure
  let clean = trimmed;
  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    if (!/[.!?]$/.test(clean)) {
      clean += '.';
    }
  }

  return clean || fallback;
}

/**
 * Formats any error (Axios error, JS Error, API response, string) into a
 * clean, polite, human-readable reason.
 */
export function formatErrorMessage(err, fallback = 'Unable to complete this action. Please try again.') {
  if (!err) return fallback;

  // 1. Direct string error
  if (typeof err === 'string') {
    return sanitizeErrorMessage(err, fallback);
  }

  // 2. Network connection or server unreachable
  if (
    err.code === 'ERR_NETWORK' ||
    err.message === 'Network Error' ||
    (!err.response && (err.code === 'ECONNABORTED' || err.message?.includes('timeout') || err.message?.includes('Network') || err.message?.includes("Can't reach database")))
  ) {
    return 'Unable to connect to SplitUp servers. Please check your network connection.';
  }

  // 3. Request timeout
  if (err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout')) {
    return 'The server took too long to respond. Please try again in a moment.';
  }

  // 4. Server responded with error status
  if (err.response) {
    const status = err.response.status;
    const data = err.response.data;

    if (data && typeof data === 'object') {
      // Zod validation errors list
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const firstErr = data.errors[0];
        const msg = firstErr.message || '';
        if (msg) {
          return sanitizeErrorMessage(msg, 'Please check that all fields are filled out correctly.');
        }
      }

      if (typeof data.message === 'string' && data.message.trim()) {
        return sanitizeErrorMessage(data.message, fallback);
      }

      if (typeof data.error === 'string' && data.error.trim()) {
        return sanitizeErrorMessage(data.error, fallback);
      }
    }

    // Meaningful status-code fallback reasons
    switch (status) {
      case 400:
        return 'Some information was incomplete or invalid. Please check your entries.';
      case 401:
        return 'Your session has expired. Please sign in again to continue.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource or page could not be found.';
      case 409:
        return 'A record with these details already exists.';
      case 422:
        return 'The submitted data could not be processed. Please verify your entries.';
      case 429:
        return 'Too many requests. Please wait a moment before trying again.';
      case 503:
        return 'The service is temporarily unavailable. Please try again shortly.';
      default:
        if (status >= 500) {
          return 'The server encountered an issue while processing your request. Please try again shortly.';
        }
        return fallback;
    }
  }

  // 5. Standard JS error message
  if (err.message) {
    return sanitizeErrorMessage(err.message, fallback);
  }

  return fallback;
}

export default formatErrorMessage;
