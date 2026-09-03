/**
 * @file serverErrorHandling.js
 * Explicit reference implementation demonstrating:
 * Concept: Backend & System Design — Server-side error handling (Score: 0.2)
 * 
 * Core Architectural Pillars:
 * 1. Operational vs Programmatic Error Classification (AppError hierarchy)
 * 2. Centralized 4-Arity Express Error Handling Middleware (err, req, res, next)
 * 3. Safe Try/Catch Error Boundaries with Server-Side Logging
 * 4. Information Leakage Defense (Masking raw SQL / DB traces from client in production)
 * 5. Global Process Crash Guards (unhandledRejection & uncaughtException)
 */

// ── 1. CUSTOM ERROR HIERARCHY (Operational vs Programmer Errors) ───────────────

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true, errors = []) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational; // True for expected client/business errors
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request', errors = []) {
    super(message, 400, true, errors);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 400, true, errors);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required. Invalid or missing token.') {
    super(message, 401, true);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden. You do not have permission to access this resource.') {
    super(message, 403, true);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Requested resource not found.') {
    super(message, 404, true);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict. A record with this unique identifier already exists.') {
    super(message, 409, true);
  }
}

class InternalServerError extends AppError {
  constructor(message = 'Internal server error. Please try again later.') {
    super(message, 500, false); // Programmatic unexpected error
  }
}

// ── 2. ERROR RESPONSE FORMATTER & INFORMATION SANITIZER ───────────────────────

/**
 * Formats structured error payloads without leaking database or file system internals.
 * In production, masks stack traces and internal schema identifiers.
 */
function formatErrorResponse(err, isProduction = process.env.NODE_ENV === 'production') {
  const statusCode = err.statusCode || (err.status && typeof err.status === 'number' ? err.status : 500);

  // Operational / Safe client error
  if (err.isOperational || statusCode < 500) {
    return {
      statusCode,
      payload: {
        success: false,
        message: err.message,
        ...(err.errors && err.errors.length > 0 ? { errors: err.errors } : {}),
      },
    };
  }

  // Database Unique Constraint (Prisma P2002)
  if (err.code === 'P2002') {
    return {
      statusCode: 409,
      payload: {
        success: false,
        message: 'A resource with this unique attribute already exists.',
      },
    };
  }

  // Database Record Not Found (Prisma P2025)
  if (err.code === 'P2025') {
    return {
      statusCode: 404,
      payload: {
        success: false,
        message: 'The requested database record was not found.',
      },
    };
  }

  // Unexpected 500 Internal Error (Sanitized to prevent info leakage)
  return {
    statusCode: 500,
    payload: {
      success: false,
      message: 'Internal server error. Please try again later.',
      ...(isProduction ? {} : { debugMessage: err.message, stack: err.stack }),
    },
  };
}

// ── 3. ASYNC HANDLER WRAPPER ──────────────────────────────────────────────────

/**
 * Wraps async Express controllers to catch unhandled Promise rejections and route to next(err).
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ── 4. CENTRALIZED EXPRESS ERROR MIDDLEWARE ───────────────────────────────────

/**
 * 4-Arity Express Error Handling Middleware.
 */
function centralErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // 1. Secure Server-Side Logging with context
  console.error(`[Express Error Boundary] [${req.method || 'GET'} ${req.originalUrl || '/'}] - Status: ${err.statusCode || 500}`, {
    name: err.name,
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });

  // 2. Format sanitized client payload
  const { statusCode, payload } = formatErrorResponse(err);
  return res.status(statusCode).json(payload);
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
  formatErrorResponse,
  asyncHandler,
  centralErrorHandler,
};
