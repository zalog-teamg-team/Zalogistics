/**
 * CORS Middleware
 *
 * Handles Cross-Origin Resource Sharing headers
 */

const config = require("../config/app.config");

/**
 * Adds CORS headers to responses
 */
function corsMiddleware(req, res, next) {
  res
    .header("Access-Control-Allow-Origin", config.cors.allowOrigin)
    .header("Vary", "Origin")
    .header("Access-Control-Allow-Methods", config.cors.allowMethods)
    .header("Access-Control-Allow-Headers", config.cors.allowHeaders);

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
}

module.exports = corsMiddleware;
