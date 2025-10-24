/**
 * Proxy Controller
 *
 * Handles HTTP requests for proxying to external APIs
 */

const proxyService = require("../services/proxyService");

class ProxyController {
  /**
   * Proxies requests to Google Sheets API
   */
  async googleSheets(req, res, next) {
    try {
      const result = await proxyService.proxyToGoogleSheets(req.body);
      res.header("Content-Type", "application/json").send(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        message: `Lỗi kết nối: ${error.message}`,
      });
    }
  }

  /**
   * Proxies requests to GPS tracking API
   */
  async gpsTracking(req, res, next) {
    try {
      const { endpoint } = req.params;
      const result = await proxyService.proxyToGPS(endpoint, req.body);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        status: 0,
        error: `GPS API error: ${error.message}`,
      });
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    res.json({
      ok: true,
      now: new Date().toISOString(),
      service: "logistics-api",
    });
  }
}

module.exports = new ProxyController();
