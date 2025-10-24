/**
 * Proxy Service
 *
 * Handles proxying requests to external APIs:
 * - Google Sheets API
 * - GPS Tracking API
 */

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const config = require("../config/app.config");

class ProxyService {
  /**
   * Proxies a request to Google Sheets API
   * @param {object} requestBody - Request body containing action and data
   * @returns {Promise<object>} - Response from Google Sheets API
   */
  async proxyToGoogleSheets(requestBody) {
    const response = await fetch(config.api.googleSheetsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        action: requestBody.action,
        postData: JSON.stringify({
          sheetKey: requestBody.sheetKey,
          writerData: requestBody.writerData,
        }),
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Google Sheets API error: ${response.statusText}`);
    }

    const text = await response.text();
    return text;
  }

  /**
   * Proxies a request to GPS tracking API
   * @param {string} endpoint - API endpoint path
   * @param {object} requestBody - Request body
   * @returns {Promise<object>} - Response from GPS API
   */
  async proxyToGPS(endpoint, requestBody) {
    const gpsUrl = `${config.api.gps.baseUrl}/${endpoint}`;

    const response = await fetch(gpsUrl, {
      method: "POST",
      headers: {
        "Consumer-Id": config.api.gps.consumerId,
        "X-Eupfin-Api-Key": config.api.gps.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody || {}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GPS API error: ${errorText || response.statusText}`);
    }

    return await response.json();
  }
}

module.exports = new ProxyService();
