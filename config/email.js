const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Optional: verify connection
transporter.verify(function (error, success) {
  if (error) {
    console.log("❌ Mailtrap connection failed:", error);
  } else {
    console.log("✅ Mailtrap SMTP server is ready to send emails");
  }
});

module.exports = transporter;
