const Guest = require("../models/guest.model");

const handleRSVP = async (req, res) => {
    // try {
        console.log("🔔 WhatsApp Webhook Received:", JSON.stringify(req.body, null, 2));

        const data = req.body;
        
        // Extracting data based on the provided structure
        const eventId = data.event_details?.event_id || data.metaData?.eventId;
        const rawPhone = data.user_data?.phone_number;
        const processing = data.processing_result;

        if (!eventId || !rawPhone || !processing) {
            console.error("❌ Missing required fields in WhatsApp webhook", { eventId, rawPhone, processing });
            return res.status(400).json({
                success: false,
                error: "Missing required fields (event_details.event_id, user_data.phone_number, processing_result)",
            });
        }

        // Clean and format phone number for lookup
        const cleanNumber = rawPhone.replace(/\D/g, '');
        const formattedPhone = cleanNumber.startsWith('92') || cleanNumber.startsWith('972') ? '+' + cleanNumber : '+' + cleanNumber;
        
        console.log(`🔍 Looking for guest with phone: ${formattedPhone} in event: ${eventId}`);

        // Find guest by phone and eventId
        const guest = await Guest.findOne({
            where: {
                eventId,
                phone: formattedPhone
            }
        });

        if (!guest) {
            console.warn(`⚠️ Guest not found: ${formattedPhone} for event ${eventId}`);
            return res.status(404).json({
                success: false,
                error: `Guest with phone ${formattedPhone} not found for event ${eventId}`,
            });
        }

        // Update guest status and count
        const newStatus = processing.status; // 'confirmed', 'cancel', etc.
        const newCount = processing.guest_count;

        if (newStatus) {
            // Map possible statuses from the bot to our database ENUM (pending, confirmed, hesitate, cancel)
            const statusMap = {
                'confirmed': 'confirmed',
                'declined': 'cancel',
                'cancelled': 'cancel',
                'cancel': 'cancel',
                'hesitate': 'hesitate',
                'maybe': 'hesitate'
            };
            guest.status = statusMap[newStatus.toLowerCase()] || 'confirmed';
        }

        if (newCount !== undefined && newCount !== null) {
            guest.peopleCount = parseInt(newCount, 10) || 1;
        }

        guest.respondedVia = "whatsapp_bot";
        await guest.save();

        console.log(`✅ Updated guest ${guest.name}: Status=${guest.status}, Count=${guest.peopleCount}`);

        return res.status(200).json({
            success: true,
            message: `Guest status updated to ${guest.status} with count ${guest.peopleCount}`,
            guest: {
                id: guest.id,
                name: guest.name,
                status: guest.status,
                peopleCount: guest.peopleCount
            }
        });
    // } catch (error) {
    //     console.error("❌ RSVP Controller Error:", error);
    //     return res.status(500).json({
    //         success: false,
    //         error: error.message || "Failed to process RSVP",
    //     });
    // }
};

module.exports = {
    handleRSVP,
};
