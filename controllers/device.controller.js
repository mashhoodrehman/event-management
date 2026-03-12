const Device = require("../models/device.model");
const Contact = require("../models/contact.model");
const Event = require("../models/event.model");
const { normalizePhone } = require("../utils/phoneNormalizer");

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
        const { eventId, name, circle } = req.body;

        if (!eventId || !name || !circle) {
            return res.status(400).json({ error: "eventId, name, and circle are required" });
        }

        // Generate unique pairing code
        let pairingCode;
        let codeExists = true;
        while (codeExists) {
            pairingCode = generatePairingCode();
            const existing = await Device.findOne({ where: { pairingCode } });
            codeExists = !!existing;
        }

        const device = await Device.create({
            eventId,
            name,
            circle,
            pairingCode,
            status: "pending"
        });

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
