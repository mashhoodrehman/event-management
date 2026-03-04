const axios = require("axios");

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

        try {
            const response = await axios.post(this.lowProfileUrl, payload, {
                headers: { "Content-Type": "application/json" }
            });

            if (response.data.ResponseCode !== 0) {
                throw new Error(`Cardcom Error: ${response.data.Description || "Unknown error"}`);
            }

            return response.data.Url;
        } catch (error) {
            console.error("Cardcom createPaymentLink error:", error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Charge a saved card token (Direct Request)
     * @param {Object} params { amount, token, eventId, description }
     * @returns {Promise<Object>} Transaction result
     */
    async chargeToken({ amount, token, eventId, description }) {
        const qs = require("qs");
        const data = {
            TerminalNumber: this.terminalNumber,
            ApiUserName: this.apiName, // DirectRequest might still use ApiUserName
            ApiPassword: this.apiPassword,
            Operation: 1, // 1 = Charge
            SumToBill: amount,
            CoinID: 1, // 1 for ILS
            CardToken: token,
            Description: description || `Charge for Event #${eventId}`,
        };

        try {
            const response = await axios.post(this.directRequestUrl, qs.stringify(data));
            const result = qs.parse(response.data);

            return {
                success: result.ResponseCode === "0",
                transactionId: result.InternalID,
                errorCode: result.ResponseCode,
                errorDescription: result.Description,
                raw: result,
            };
        } catch (error) {
            console.error("Cardcom chargeToken error:", error.message);
            throw error;
        }
    }
}

module.exports = new CardcomService();

