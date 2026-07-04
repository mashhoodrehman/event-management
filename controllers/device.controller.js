const Device = require("../models/device.model");
const Contact = require("../models/contact.model");
const Event = require("../models/event.model");
const Guest = require("../models/guest.model");
const { normalizePhone } = require("../utils/phoneNormalizer");
const axios = require("axios");
const whatsappService = require("../services/whatsapp.service");

const EXTERNAL_API_URL = "https://invitenow-ai.revuity.com/api";
const EXTERNAL_API_KEY = "597fe70bb45c421db3c5a87c677cb8c3";

// Generate a pairing code like A7X-924
const generatePairingCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
    code += '-';
    for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
};

exports.createDevice = async (req, res) => {
    try {
        const { event_id, name, circle, phone } = req.body;
        const localEventId = event_id || req.body.eventId;

        if (!localEventId || !name || !circle) {
            return res.status(400).json({ error: "event_id, name, and circle are required" });
        }

        const event = await Event.findByPk(localEventId);
        if (!event) {
            return res.status(404).json({ error: "Local event not found" });
        }

        // 1. Ensure external event exists
        let event_uid = event.event_uid;
        if (!event_uid) {
            console.log(`Creating external event for local event ${localEventId}...`);
            const guests = await Guest.findAll({ where: { eventId: localEventId } });
            const guestNames = guests.map(g => g.name);

            try {
                const externalEventRes = await axios.post(`${EXTERNAL_API_URL}/events/create`, {
                    user_id: event.userId.toString(),
                    name: event.name,
                    guests: guestNames
                }, {
                    headers: {
                        'Authorization': `Bearer ${EXTERNAL_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (externalEventRes.data && externalEventRes.data.event_id) {
                    event_uid = externalEventRes.data.event_id;
                    event.event_uid = event_uid;
                    await event.save();
                    console.log(`External event created with UID: ${event_uid}`);
                } else {
                    throw new Error("Failed to get event_id from external API");
                }
            } catch (externalError) {
                console.error("Error creating external event:", externalError.response?.data || externalError.message);
                return res.status(502).json({ 
                    error: "Failed to create external event", 
                    details: externalError.response?.data || externalError.message 
                });
            }
        }

        // 2. Create external device
        console.log(`Creating external device for event ${event_uid}...`);
        let pairingCode;
        try {
            const externalDeviceRes = await axios.post(`${EXTERNAL_API_URL}/devices/create`, {
                event_id: event_uid,
                name: name,
                circle: circle
            }, {
                headers: {
                    'Authorization': `Bearer ${EXTERNAL_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            if (externalDeviceRes.data && externalDeviceRes.data.pairing_code) {
                pairingCode = externalDeviceRes.data.pairing_code;
                console.log(`External device created with pairing code: ${pairingCode}`);
            } else {
                throw new Error("Failed to get pairing_code from external API");
            }
        } catch (deviceError) {
            console.error("Error creating external device:", deviceError.response?.data || deviceError.message);
            // Fallback to local generation if external fails? No, user wants it completed first.
            return res.status(502).json({ 
                error: "Failed to create external device", 
                details: deviceError.response?.data || deviceError.message 
            });
        }

        // 3. Create local device record
        const device = await Device.create({
            eventId: localEventId,
            name,
            circle,
            pairingCode,
            phone,
            status: "pending"
        });

        // 4. Send WhatsApp invitation if phone is provided
        if (phone && (circle === 2 || circle === 3)) {
            try {
                const message = `היי ${name}! הוזמנת לעזור בארגון האירוע "${event.name}". \nאנא התקן את אפליקציית InviteNow והשתמש בקוד ההתחברות שלך: ${pairingCode}`;
                await whatsappService.sendExternalWhatsApp(phone, message, {
                    eventId: localEventId,
                    eventName: event.name
                });
                console.log(`WhatsApp invitation sent to ${phone}`);
            } catch (waError) {
                console.error("Failed to send WhatsApp invitation:", waError.message);
                // We don't fail the whole request because the device was created.
            }
        }

        res.status(201).json(device);
    } catch (error) {
        console.error("Error creating device:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.getDevicesByEvent = async (req, res) => {
    try {
        const { eventId } = req.params;
        const devices = await Device.findAll({
            where: { eventId },
            order: [["createdAt", "ASC"]]
        });


        res.json({ devices });
    } catch (error) {
        console.error("Error fetching devices:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.deleteDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Device.destroy({ where: { id } });
        if (!deleted) {
            return res.status(404).json({ error: "Device not found" });
        }
        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting device:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Mobile app pairing
exports.pairDevice = async (req, res) => {
    try {
        const { pairingCode } = req.body;

        if (!pairingCode) {
            return res.status(400).json({ error: "pairingCode is required" });
        }

        const device = await Device.findOne({
            where: { pairingCode },
            include: [{ model: Event, attributes: ["name"] }]
        });

        if (!device) {
            return res.status(404).json({ error: "Code not found" });
        }

        if (device.status === "connected") {
            return res.status(410).json({ error: "Code already used" });
        }

        device.status = "connected";
        await device.save();

        res.json({
            deviceId: device.id,
            eventId: device.eventId,
            circle: device.circle,
            eventName: device.Event ? device.Event.name : "Event"
        });
    } catch (error) {
        console.error("Error pairing device:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Mobile app contact upload
exports.uploadContacts = async (req, res) => {
    try {
        const { deviceId, contacts } = req.body;

        if (!deviceId || !contacts || !Array.isArray(contacts)) {
            return res.status(400).json({ error: "deviceId and contacts array are required" });
        }

        const device = await Device.findByPk(deviceId);
        if (!device) {
            return res.status(404).json({ error: "Device not found" });
        }

        if (device.status !== "connected") {
            return res.status(400).json({ error: "Device not yet paired" });
        }

        // Delete existing contacts for this device to allow re-upload
        await Contact.destroy({ where: { deviceId } });

        // Batch insert contacts
        const validContacts = contacts
            .filter(c => c.name && c.phone)
            .map(c => ({
                deviceId,
                name: c.name,
                phone: normalizePhone(c.phone)
            }));

        if (validContacts.length > 0) {
            await Contact.bulkCreate(validContacts);
        }

        res.json({ received: validContacts.length });
    } catch (error) {
        console.error("Error uploading contacts:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.checkDeviceStatuses = async (req, res) => {
    try {
        const { device_ids } = req.body;

        if (!device_ids || !Array.isArray(device_ids)) {
            return res.status(400).json({ error: "device_ids array is required" });
        }

        const externalRes = await axios.post(`${EXTERNAL_API_URL}/devices/status`, {
            device_ids
        }, {
            headers: {
                'Authorization': `Bearer ${EXTERNAL_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // Sync local database if status changed to connected
        const externalDevices = externalRes.data.devices || [];
        for (const extDevice of externalDevices) {
            if (extDevice.status === 'connected') {
                await Device.update(
                    { status: 'connected' },
                    { where: { pairingCode: extDevice.pairing_code, status: 'pending' } }
                );
            }
        }

        res.json(externalRes.data);
    } catch (error) {
        console.error("Error checking device statuses:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ 
            error: "Failed to check device statuses",
            details: error.response?.data || error.message 
        });
    }
};
