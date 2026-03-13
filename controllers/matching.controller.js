const axios = require("axios");
const Event = require("../models/event.model");
const Guest = require("../models/guest.model");

const INVITE_NOW_API_KEY = "597fe70bb45c421db3c5a87c677cb8c3";
const INVITE_NOW_BASE_URL = "https://invitenow-ai.revuity.com/api";

exports.runMatching = async (req, res) => {
  const { event_uid } = req.body;

  if (!event_uid) {
    return res.status(400).json({ success: false, message: "event_uid is required" });
  }

  try {
    const response = await axios.post(
      `${INVITE_NOW_BASE_URL}/matching/run`,
      { event_id: event_uid },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INVITE_NOW_API_KEY}`,
        },
      }
    );

    return res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    console.error("Error running matching:", error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to run matching",
      error: error.response?.data || error.message,
    });
  }
};

exports.getMatchingResults = async (req, res) => {
  const { event_uid } = req.params;
  const { search } = req.query;

  if (!event_uid) {
    return res.status(400).json({ success: false, message: "event_uid is required" });
  }

  try {
    const response = await axios.get(`${INVITE_NOW_BASE_URL}/matching/results/${event_uid}`, {
      params: { search },
      headers: {
        Authorization: `Bearer ${INVITE_NOW_API_KEY}`,
      },
    });

    return res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    console.error("Error fetching matching results:", error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to fetch matching results",
      error: error.response?.data || error.message,
    });
  }
};

exports.getEventContacts = async (req, res) => {
  const { event_uid } = req.params;
  const { search, page, limit } = req.query;

  if (!event_uid) {
    return res.status(400).json({ success: false, message: "event_uid is required" });
  }

  try {
    const response = await axios.get(`${INVITE_NOW_BASE_URL}/contacts/list/${event_uid}`, {
      params: { search, page, limit },
      headers: {
        Authorization: `Bearer ${INVITE_NOW_API_KEY}`,
      },
    });

    return res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    console.error("Error fetching event contacts:", error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to fetch event contacts",
      error: error.response?.data || error.message,
    });
  }
};

exports.confirmGuest = async (req, res) => {
  const { guest_uid, phone, eventId, localGuestId, name } = req.body;

  if (!guest_uid || !phone) {
    return res.status(400).json({ success: false, message: "guest_uid and phone are required" });
  }

  try {
    // 1. Confirm with external AI
    await axios.post(
      `${INVITE_NOW_BASE_URL}/guests/confirm`,
      { guest_id: guest_uid, phone },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INVITE_NOW_API_KEY}`,
        },
      }
    );

    // 2. Update local guest record
    if (localGuestId) {
      await Guest.update({ phone }, { where: { id: localGuestId } });
    } else if (eventId && name) {
      // Find guest by name and eventId
      const guest = await Guest.findOne({ 
        where: { 
          name: name,
          eventId: eventId 
        } 
      });
      if (guest) {
        await guest.update({ phone });
      }
    }

    return res.status(200).json({ success: true, message: "Guest confirmed successfully" });
  } catch (error) {
    console.error("Error confirming guest:", error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to confirm guest",
      error: error.response?.data || error.message,
    });
  }
};

exports.rejectGuest = async (req, res) => {
  const { guest_uid } = req.body;

  if (!guest_uid) {
    return res.status(400).json({ success: false, message: "guest_uid is required" });
  }

  try {
    await axios.post(
      `${INVITE_NOW_BASE_URL}/guests/reject`,
      { guest_id: guest_uid },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INVITE_NOW_API_KEY}`,
        },
      }
    );

    return res.status(200).json({ success: true, message: "Guest rejected successfully" });
  } catch (error) {
    console.error("Error rejecting guest:", error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to reject guest",
      error: error.response?.data || error.message,
    });
  }
};

exports.updateEventStatus = async (req, res) => {
  const { eventId } = req.params;
  const { isMatchingCompleted, runAutomation } = req.body;

  try {
    const event = await Event.findByPk(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    if (isMatchingCompleted !== undefined) event.isMatchingCompleted = isMatchingCompleted;
    if (runAutomation !== undefined) event.runAutomation = runAutomation;

    await event.save();
    return res.status(200).json({ success: true, data: event });
  } catch (error) {
    console.error("Error updating event status:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
