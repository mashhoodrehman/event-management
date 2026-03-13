const axios = require("axios");
const { withRetry } = require("../utils/retry");
const CardcomService = require("../services/cardcom.service");
const Payment = require("../models/payment.model");
const Event = require("../models/event.model");
const User = require("../models/user.model");
const Guest = require("../models/guest.model");
const MessageTemplate = require("../models/messageTemplate.model");
const EventAutomationSchedule = require("../models/eventAutomationSchedule.model");
const EventSetting = require("../models/eventSetting.model");
const { createAutomations } = require("../services/automationScheduler");

/**
 * Handle Cardcom Webhook (Indicator)
 */
const cardcomWebhook = async (req, res) => {
    try {
        // Cardcom sends data in query for GET or body for POST depending on setup.
        // Usually it's POST if IndicatorURL is called.
        console.log("-------------------------------------------");
        console.log("🔔 CARDCOM WEBHOOK TRIGGERED");
        console.log("Body:", JSON.stringify(req.body, null, 2));
        console.log("-------------------------------------------");

        const data = { ...req.query, ...req.body }; // Handle both GET and POST data

        const ResponseCode = data.ResponseCode;
        const InternalID = data.TranzactionId || data.TranzactionInfo?.TranzactionId || data.InternalID;
        const CardToken = data.TokenInfo?.Token || data.TranzactionInfo?.Token || data.CardToken;
        const CardLast4 = data.TranzactionInfo?.Last4CardDigitsString || data.TranzactionInfo?.Last4CardDigits || data.CardLast4;
        const ReturnValue = data.ReturnValue;
        const SumToBill = data.TranzactionInfo?.Amount || data.SumToBill;
        const CardMonth = data.TokenInfo?.CardMonth || data.TranzactionInfo?.CardMonth || data.CardMonth;
        const CardYear = data.TokenInfo?.CardYear || data.TranzactionInfo?.CardYear || data.CardYear;

        console.log(ReturnValue , "return value")

        if (String(ResponseCode) !== "0") {
            console.warn("Cardcom transaction failed reported by webhook:", data);
            return res.send("OK"); // Still return OK to Cardcom
        }

        // Parse metadata
        let metadata = {};
        try {
            metadata = JSON.parse(ReturnValue || "{}");
        } catch (e) {
            console.error("Failed to parse Cardcom ReturnValue:", ReturnValue);
        }

        const { eventId, userId } = metadata;

        if (!eventId) {
            console.error("No eventId in Cardcom ReturnValue");
            return res.status(400).send("No eventId");
        }

        // 1. Update Payment record
        // Match by eventId and type, looking for the 'initiated' record
        const payment = await Payment.findOne({
            where: { eventId, type: "setup_fee", status: "initiated" }
        });

        if (payment) {
            payment.status = "succeeded";
            payment.paymentIntentId = String(InternalID || "N/A");
            await payment.save();
            console.log(`Payment confirmed for Event ${eventId}`);
        } else {
            // Check if it's already succeeded (idempotency)
            const alreadySucceeded = await Payment.findOne({
                where: { eventId, type: "setup_fee", status: "succeeded" }
            });

            if (!alreadySucceeded) {
                // Create if it doesn't exist at all
                await Payment.create({
                    eventId,
                    amount: parseFloat(SumToBill || 0) * 100, // store in cents
                    currency: "ils",
                    paymentIntentId: String(InternalID || "N/A"),
                    status: "succeeded",
                    type: "setup_fee",
                });
            } else {
                console.log(`Payment record already exists/succeeded for Event ${eventId}. Continuing to automation check.`);
            }
        }

        console.log(userId, "user id", CardToken, "card token", CardLast4, "card last 4");

        // 2. Update User's Cardcom Token
        if (userId && CardToken) {
            const user = await User.findByPk(userId);
            if (user) {
                user.cardcomToken = CardToken;
                user.cardcomLast4 = CardLast4;
                if (CardMonth) user.cardcomExpMonth = String(CardMonth);
                if (CardYear) user.cardcomExpYear = String(CardYear);
                await user.save();
                console.log(`Saved Cardcom Token for User ${userId}`);
            }
        }

        // 3. Trigger Automations (Guard against multiple calls)
        const event = await Event.findByPk(eventId);
        if (event) {
            // Check if automations already exist for this event to avoid duplicates
            const existingSchedules = await EventAutomationSchedule.findOne({ where: { eventId } });

            if (existingSchedules) {
                console.log(`Automations already scheduled for event ${eventId}, skipping.`);
            } else {
                const guests = await Guest.findAll({ where: { eventId } });
                const settings = await EventSetting.findOne({ where: { eventId } });

                if (settings) {
                    // trigger Bot Config API after payment is confirmed
                    try {
                        const botConfigUrl = `https://invitenow-qr.revuity.com/bot/config?id=mmrtest`;
                        const webhookUrl = "https://aridar-cms-api.revuity.com/api/whatsapp/status";

                        const payload = {
                            name: `rsvp-bot-${event.id}-`,
                            webhookUrl: webhookUrl,
                            metaData: {
                                eventId: event.id
                            },
                            autoReply: true,
                            replyMessages: {
                                count: `מעולה, רשמנו! נתראה ב ${event.name || "JOHN DOE"} 🎉`,
                                "לא": "חבל, נתראה בשמחות! ❤️",
                                "אולי": "אין בעיה, נדבר בהמשך לעדכון. 👍"
                            }
                        };

                        console.log(`Triggering bot config for event ${event.id} after payment...`);

                        await withRetry(async () => {
                            const response = await axios.post(botConfigUrl, payload, {
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                timeout: 30000,
                            });
                            console.log(`✅ Bot configured successfully for event ${event.id}`);
                            return response;
                        }).catch(err => {
                            console.error(`❌ Bot config trigger failed for event ${event.id}:`, err.response?.data || err.message);
                        });
                    } catch (botErr) {
                        console.error(`❌ Failed to initiated bot config for event ${event.id}:`, botErr.message);
                    }

                    const template = await MessageTemplate.findOne({ where: { eventId } });
                    const templates = {
                        smsTemplateId: template?.id || null,
                        whatsappTemplateId: template?.id || null,
                        aiCallTemplateId: template?.id || null,
                        humanCallTemplateId: template?.id || null,
                    };
                    await createAutomations(event, guests, templates);
                    console.log(`Automations scheduled for event ${eventId}`);
                }
            }
        }

        res.send("OK");
    } catch (error) {
        console.error("Cardcom Webhook Error:", error);
        res.status(500).send("Internal Server Error");
    }
};

module.exports = { cardcomWebhook };
