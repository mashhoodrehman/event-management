// helpers/smsHelper.js
const axios = require("axios");

/**
 * Send an SMS via any SMS API.
 * @param {string} url - API endpoint
 * @param {string} number - Recipient phone number (with country code)
 * @param {string} message - Message content
 * @param {Object} [headers={}] - Optional API headers (e.g., Authorization)
 * @returns {Promise<Object>} - API response
 */
const sendSMS = async (url, number, message, headers = {}) => {
  try {
    const response = await axios.post(
      url,
      {
        to: number,
        message,
      },
      { headers }
    );
    return response.data;
  } catch (err) {
    console.error("Error sending SMS:", err.response?.data || err.message);
    throw err;
  }
};

module.exports = sendSMS;
