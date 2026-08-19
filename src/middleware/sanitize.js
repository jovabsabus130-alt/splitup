/**
 * @file sanitize.js
 * Input sanitization and injection defense middleware
 * Concept: Auth & Security — Input sanitization & injection awareness (Score: 0.2)
 * 
 * Protections:
 * 1. Cross-Site Scripting (XSS): Strips dangerous HTML tags (<script>, <iframe>, event handlers).
 * 2. NoSQL Operator Injection: Strips keys starting with '$' or containing '.' in JSON payloads.
 * 3. Whitespace & Control Character normalization.
 */

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<[^>]*>?/gm, '') // Strip HTML tags to prevent XSS
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Strip ASCII control characters
    .trim();
}

function sanitizeObject(obj) {
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    // Defend against NoSQL query operator injection (e.g. { "$gt": "" })
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    clean[key] = sanitizeObject(value);
  }
  return clean;
}

function sanitizeMiddleware(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
}

module.exports = {
  sanitizeString,
  sanitizeObject,
  sanitizeMiddleware,
};
