/**
 * Error Handler Middleware
 *
 * Centralized error handling for the application
 */

const constants = require("../config/constants");

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  console.error("Error:", err);

  // Handle specific error types
  if (err.message === constants.ERRORS.CONFLICT) {
    return res.status(constants.HTTP_STATUS.CONFLICT).json({
      ok: false,
      error: err.message,
    });
  }

  if (
    err.message === constants.ERRORS.INVALID_FILENAME ||
    err.message === constants.ERRORS.INVALID_MONTH ||
    err.message === constants.ERRORS.INVALID_DATA_FORMAT
  ) {
    return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
      ok: false,
      error: err.message,
    });
  }

  // Default error response
  res
    .status(err.statusCode || constants.HTTP_STATUS.INTERNAL_SERVER_ERROR)
    .json({
      ok: false,
      error: err.message || "Internal server error",
    });
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    error: "Route not found",
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
