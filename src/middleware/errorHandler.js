/**
 * @file errorHandler.js
 * Comprehensive Centralized Express Error Handling Architecture
 * 
 * Concept: Server-Side Error Handling, HTTP Status Standard, Information Leakage Prevention
 * 
 * Architecture:
 * 1. Custom Error Hierarchy:
 *    - AppError (Base operational error class)
 *    - BadRequestError (400) & ValidationError (400 with field path mappings)
 *    - UnauthorizedError (401)
 *    - ForbiddenError (403)
 *    - NotFoundError (404)
 *    - ConflictError (409)
 *    - InternalServerError (500)
 * 2. Specialized Error Mappers:
 *    - Zod Validation Errors (400)
 *    - Prisma ORM Errors (P2002 -> 409, P2025 -> 404, P2003 -> 400, P2014 -> 400)
 *    - JWT Errors (JsonWebTokenError, TokenExpiredError -> 401)
 *    - Malformed JSON Syntax Errors -> 400
 * 3. Information Leakage Prevention:
 *    - Full stack traces and query details logged server-side for observability.
 *    - Production client responses sanitized to prevent leaking database schema or internal paths.
 * 4. Async Handler: Wraps route handlers to catch all rejected promises and pass to next(err).
 */

// ── Custom Error Hierarchy ───────────────────────────────────────────────────

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, true);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 400, true);
    this.errors = errors;
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access. Authentication required.') {
    super(message, 401, true);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden. You do not have permission to perform this action.') {
    super(message, 403, true);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found') {
    super(message, 404, true);
  }
}

class ConflictError extends AppError {
  constructor(message = 'A resource with this identifier already exists.') {
    super(message, 409, true);
  }
}

class InternalServerError extends AppError {
  constructor(message = 'Internal server error. Please try again later.') {
    super(message, 500, false);
  }
}

/**
 * Higher-Order Function / Wrapper to eliminate repetitive try/catch boilerplate.
 * Automatically catches all asynchronous promise rejections and forwards them to next(error).
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Centralized 4-Arity Express Error Handling Middleware.
 * Express identifies error handlers exclusively by having 4 arguments: (err, req, res, next).
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isProduction = process.env.NODE_ENV === 'production';
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors || undefined;

  // 1. Log detailed error diagnostics on the server for maintainability
  console.error(`[Server-Side Error] [${req.method} ${req.originalUrl}] - Status ${statusCode}:`, {
    name: err.name,
    message: err.message,
    code: err.code,
    stack: isProduction ? undefined : err.stack,
  });

  // 2. Handle Body Parser Malformed JSON Syntax Errors (400)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Malformed JSON payload in request body';
  }

  // 3. Handle Zod Schema Validation Errors (400)
  else if (err.name === 'ZodError' || (err.issues && Array.isArray(err.issues))) {
    statusCode = 400;
    message = 'Request validation failed';
    const issues = err.errors || err.issues || [];
    errors = issues.map((i) => ({
      path: Array.isArray(i.path) ? i.path.join('.') : String(i.path || ''),
      message: i.message,
    }));
  }

  // 4. Handle JSON Web Token Errors (401)
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token expired. Please login again.';
  }

  // 5. Handle Prisma ORM Known Database Errors
  else if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation (e.g. duplicate email or group membership)
        statusCode = 409;
        message = 'A resource with this unique attribute already exists.';
        break;
      case 'P2025': // Record to update or delete not found
        statusCode = 404;
        message = 'The requested database record was not found.';
        break;
      case 'P2003': // Foreign key constraint failed
        statusCode = 400;
        message = 'Invalid relation reference. Referenced record does not exist.';
        break;
      case 'P2014': // Relation violation
        statusCode = 400;
        message = 'The requested change would violate data relationship constraints.';
        break;
      default:
        // Generic database errors are masked to prevent SQL / schema harvesting
        statusCode = 500;
        message = 'Database operation failed. Internal details masked for security.';
        break;
    }
  }

  // 6. Handle Known Operational Application Errors (4xx)
  else if (err.isOperational) {
    statusCode = err.statusCode || 400;
    message = err.message;
  }

  // 7. Sanitize Unknown / Unexpected System 500 Errors
  else {
    statusCode = 500;
    message = isProduction ? 'Internal server error. Please try again later.' : (err.message || 'Internal server error');
  }

  const responsePayload = {
    message,
    ...(errors ? { errors } : {}),
    ...(isProduction ? {} : { debugStack: err.stack }),
  };

  return res.status(statusCode).json(responsePayload);
}

/**
 * 404 Catch-All Middleware for undefined endpoints.
 */
function notFoundHandler(req, res, next) {
  next(new NotFoundError(`Resource not found: Cannot ${req.method} ${req.originalUrl}`));
}

module.exports = {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  asyncHandler,
  errorHandler,
  notFoundHandler,
};
