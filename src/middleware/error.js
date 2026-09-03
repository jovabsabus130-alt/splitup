/**
 * @file error.js
 * Centralized Server-Side Error Handling Middleware for Express
 * Concept: Server-side error handling (Score: 0.2)
 */

class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Global 4-argument Express error middleware
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let { statusCode, message } = err;
  if (!err.isOperational && !err.statusCode) {
    statusCode = err.status || 500;
    message = err.message || 'Internal Server Error';
  }

  res.locals.errorMessage = err.message;

  const response = {
    code: statusCode || 500,
    message: message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  };

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[Server Error] ${req.method} ${req.originalUrl || req.url} - Status ${statusCode}:`, err);
  }

  return res.status(statusCode || 500).json(response);
};

module.exports = {
  ApiError,
  errorHandler,
};
