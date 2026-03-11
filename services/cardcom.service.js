const axios = require("axios");
const { withRetry } = require("../utils/retry");

/**
 * Cardcom Service to handle payments and tokenization
 * Updated to use v11 JSON API to match working configurations
 */
class CardcomService {
    constructor() {
        this.terminalNumber = process.env.CARDCOM_TERMINAL_NUMBER || "178546";
        this.apiName = process.env.CARDCOM_USER_NAME || "rv9lS4Io85c3xdb2CmHZ"; // In v11 it's ApiName
        this.apiPassword = process.env.CARDCOM_API_PASSWORD || "wACiMRwEclrq8w4NK3O9";
        this.lowProfileUrl = "https://secure.cardcom.solutions/api/v11/LowProfile/Create";
        this.transactionUrl = "https://secure.cardcom.solutions/api/v11/Transactions/Transaction";
        this.directRequestUrl = "https://secure.cardcom.solutions/Interface/DirectRequest.aspx";
    }

    /**
     * Create a Low Profile payment link (v11 API)
     * @param {Object} params { amount, eventId, userId, successUrl, errorUrl, indicatorUrl }
     * @returns {Promise<string>} Redirect URL
     */
    async createPaymentLink({ amount, eventId, userId, successUrl, errorUrl, indicatorUrl }) {
        const payload = {
            TerminalNumber: parseInt(this.terminalNumber),
            ApiName: this.apiName,
            ApiPassword: this.apiPassword,
            ReturnValue: JSON.stringify({ eventId, userId }),
            // Amount: amount,
            Amount: 0.01,
            CoinID: 1, // 1 for ILS
            Operation: "ChargeAndCreateToken", // Correct operation for tokenization in v11
            ProductName: `Setup Fee for Event #${eventId}`,
            SuccessRedirectUrl: successUrl,
            FailedRedirectUrl: errorUrl,
            WebHookUrl: indicatorUrl, // v11 uses WebHookUrl
        };

        const response = await withRetry(async () => {
            return await axios.post(this.lowProfileUrl, payload, {
                headers: { "Content-Type": "application/json" },
                timeout: 30000, // 30s — longer timeout for slow network
            });
        });

        if (response.data.ResponseCode !== 0) {
            throw new Error(`Cardcom Error: ${response.data.Description || "Unknown error"}`);
        }

        return response.data.Url;
    }

    /**
     * Charge a saved card token (Direct Request)
     * @param {Object} params { amount, token, eventId, description }
     * @returns {Promise<Object>} Transaction result
     */
    async chargeToken({ amount, token, eventId, description, user }) {
        // Format MMYY for v11 API
        let expDate = "0000";
        if (user && user.cardcomExpMonth && user.cardcomExpYear) {
            const m = String(user.cardcomExpMonth).padStart(2, "0");
            const y = String(user.cardcomExpYear).slice(-2);
            expDate = m + y;
        }

        const payload = {
            TerminalNumber: parseInt(this.terminalNumber),
            ApiName: this.apiName,
            ApiPassword: this.apiPassword,
            Operation: "Charge",
            Amount: amount,
            CoinID: 1, // 1 for ILS
            Token: token,
            CardExpirationMMYY: expDate,
        };

        try {
            const response = await withRetry(async () => {
                return await axios.post(this.transactionUrl, payload, {
                    headers: { "Content-Type": "application/json" },
                    timeout: 30000, // 30s — longer timeout for slow network
                });
            });

            const result = response.data;

            if (result.ResponseCode !== 0) {
                console.error("Cardcom chargeToken error response:", result);
            }

            return {
                success: result.ResponseCode === 0,
                transactionId: result.InternalID,
                errorCode: result.ResponseCode,
                errorDescription: result.Description || result.message || "Unknown Cardcom Error",
                raw: result,
            };
        } catch (error) {
            const isTimeout = error.code === "ETIMEDOUT" || error.code === "ECONNABORTED";
            console.error(
                isTimeout
                    ? "Cardcom chargeToken timed out — server unreachable after retries"
                    : "Cardcom chargeToken error:",
                error.response?.data || error.message
            );
            throw error;
        }
    }
}

module.exports = new CardcomService();

