/**
 * @file errorHandler.js
 * Centralized Express Error Handling Middleware & Custom Error Classes
 * 
 * Concept: Server-side Error Handling & Information Leakage Prevention
 * 
 * Design Principles:
 * 1. Operational (Expected) vs Programmatic (Unexpected) Error Separation:
 *    - Expected errors (4xx: validation, not found, unauthorized) return clean, safe client messages.
 *    - Unexpected errors (500: DB connectivity, null pointers) log full server-side stacks
 *      but return generic sanitized messages to prevent leaking schema or system internals.
 * 2. Prisma & Zod Awareness: Translates ORM/Schema codes into standard HTTP responses.
 * 3. 4-Arity Express Middleware: (err, req, res, next) ensures Express routes all unhandled exceptions here.
 */

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, true);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, true);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Invalid request parameters', errors = []) {
    super(message, 400, true);
    this.errors = errors;
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, true);
  }
}

/**
 * Async handler wrapper to eliminate repetitive try/catch boilerplate in route definitions.
 * Automatically forwards any rejected promise to next(error).
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Centralized 4-argument Express error handling middleware.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Log full internal error details on the server for debugging
  console.error(`[Express Error] [${req.method} ${req.originalUrl}] - Status: ${err.statusCode || 500}:`, {
    message: err.message,
    stack: isProduction ? undefined : err.stack,
    code: err.code,
  });

  // 2. Handle Zod validation errors (400 Bad Request)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      message: 'Validation failed',
      errors: err.errors ? err.errors.map(e => ({ path: e.path.join('.'), message: e.message })) : [],
    });
  }

  // 3. Handle Prisma ORM Known Errors (e.g. Unique constraints, foreign key violations)
  if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    // P2002: Unique constraint violation (e.g. duplicate email, duplicate group member)
    if (err.code === 'P2002') {
      return res.status(409).json({
        message: 'A resource with this unique attribute already exists.',
      });
    }
    // P2025: Record to update/delete does not exist
    if (err.code === 'P2025') {
      return res.status(404).json({
        message: 'The requested record was not found.',
      });
    }
    // Generic DB error: deliberate masking to prevent SQL injection schema harvesting
    return res.status(500).json({
      message: 'Database operation failed. Internal details masked for security.',
    });
  }

  // 4. Handle Known Operational Application Errors (4xx)
  if (err.isOperational) {
    const response = { message: err.message };
    if (err.errors && err.errors.length > 0) response.errors = err.errors;
    return res.status(err.statusCode || 400).json(response);
  }

  // 5. Unhandled / Unexpected 500 Internal Server Errors
  // Deliberately avoid leaking stack traces or internal environment variables
  return res.status(500).json({
    message: 'Internal server error. Please try again later.',
    ...(isProduction ? {} : { debugMessage: err.message }),
  });
}

module.exports = {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  asyncHandler,
  errorHandler,
};
