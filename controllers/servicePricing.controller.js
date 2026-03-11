// controllers/servicePricing.controller.js
const ServicePricing = require("../models/servicePricing.model");

// ✅ API #1: GET all services (admin will use this)
const getAllServices = async (req, res) => {
  try {
    const services = await ServicePricing.findAll({
      order: [["id", "ASC"]],
    });

    return res.status(200).json({
      services: services.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        priceAgorot: s.priceAgorot,
        priceILS: Number((s.priceAgorot / 100).toFixed(2)),
        description: s.description,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (err) {
    console.error("getAllServices error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ✅ API #2: Admin update ONLY price + description
// PATCH /api/admin/services/:id
const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { priceAgorot, description } = req.body;

    const service = await ServicePricing.findByPk(id);
    if (!service) return res.status(404).json({ error: "Service not found" });

    // only allow updating these fields
    if (priceAgorot !== undefined) {
      const p = Number(priceAgorot);
      if (!Number.isFinite(p) || p < 0) {
        return res.status(400).json({ error: "priceAgorot must be >= 0" });
      }
      service.priceAgorot = Math.round(p);
    }

    if (description !== undefined) {
      service.description = String(description);
    }

    await service.save();

    return res.status(200).json({
      message: "Service updated",
      service: {
        id: service.id,
        key: service.key,
        name: service.name,
        priceAgorot: service.priceAgorot,
        priceILS: Number((service.priceAgorot / 100).toFixed(2)),
        description: service.description,
      },
    });
  } catch (err) {
    console.error("updateService error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
const getAllServicePricing = async (req, res) => {
  try {
    const prices = await ServicePricing.findAll({
      attributes: ["id", "key", "name", "priceAgorot", "description"],
      order: [["id", "ASC"]],
    });

    return res.json({
      success: true,
      data: prices,
    });
  } catch (error) {
    console.error("Get Service Pricing Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch service pricing",
    });
  }
};

module.exports = { getAllServices, updateService, getAllServicePricing };
