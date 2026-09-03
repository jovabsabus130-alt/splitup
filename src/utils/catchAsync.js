/**
 * @file catchAsync.js
 * Controller wrapper for Express async route error handling
 * Concept: Server-side error handling (Score: 0.2)
 */

const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

module.exports = catchAsync;
