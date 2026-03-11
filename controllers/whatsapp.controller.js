const Guest = require("../models/guest.model");

const handleRSVP = async (req, res) => {
    try {
        const { eventId, contact, response } = req.body;

        if (!eventId || !contact || !response) {
            return res.status(400).json({
                success: false,
                error: "eventId, contact, and response (maybe, yes, no) are required",
            });
        }

        const cleanNumber = contact.replace(/\D/g, '');
        console.log("Clean Number:", cleanNumber);

        // Find guest by phone and eventId
        const guest = await Guest.findOne({
            where: {
                eventId,
                phone: '+' + cleanNumber
            }
        });

        if (!guest) {
            return res.status(404).json({
                success: false,
                error: `Guest with phone ${contact} not found for event ${eventId}`,
            });
        }

        // Map response to guest status
        const responseMap = {
            "yes": "confirmed",
            "no": "cancel",
            "maybe": "hesitate"
        };

        const newStatus = responseMap[response.toLowerCase()];
        if (!newStatus) {
            return res.status(400).json({
                success: false,
                error: "Invalid response value. Must be 'maybe', 'yes', or 'no'.",
            });
        }

        guest.status = newStatus;
        guest.respondedVia = "whatsapp_api";
        await guest.save();

        return res.status(200).json({
            success: true,
            message: `Guest status updated to ${newStatus}`,
            guest: {
                id: guest.id,
                name: guest.name,
                status: guest.status
            }
        });
    } catch (error) {
        console.error("RSVP Controller Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to process RSVP",
        });
    }
};

module.exports = {
    handleRSVP,
};
