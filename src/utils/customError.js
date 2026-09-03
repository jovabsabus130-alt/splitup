/**
 * @file customError.js
 * Custom Error Class for Server-Side Error Handling
 * Concept: Server-side error handling (Score: 0.2)
 */

class CustomError extends Error {
  constructor(message, statusCode = 500, errors = []) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = CustomError;
