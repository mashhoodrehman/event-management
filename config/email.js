const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  host: "smtp.elasticemail.com",
  port: 2525,
  secure: false, // must be false for TLS on port 587
  auth: {
    user: process.env.EMAIL_USER, // orders@simtlv.co.il
    pass: process.env.EMAIL_PASS, // Gmail app password
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Optional: verify connection
transporter.verify(function (error, success) {
  if (error) {
    console.log("❌ Gmail SMTP connection failed:", error);
  } else {
    console.log("✅ Gmail SMTP server is ready to send emails");
  }
});

module.exports = transporter;

// const nodemailer = require("nodemailer");
// require("dotenv").config();

// const transporter = nodemailer.createTransport({
//   host: process.env.EMAIL_HOST,
//   port: process.env.EMAIL_PORT,
//   auth: {
//     user: "36581088886f22",
//     pass: "2fd591b23e1f9e",
//   },
// });

// // Optional: verify connection
// transporter.verify(function (error, success) {
//   if (error) {
//     console.log("❌ Mailtrap connection failed:", error);
//   } else {
//     console.log("✅ Mailtrap SMTP server is ready to send emails");
//   }
// });

// module.exports = transporter;
