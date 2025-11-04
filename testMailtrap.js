const transporter = require("./config/email");
require("dotenv").config();

async function sendTestEmail() {
  try {
    const info = await transporter.sendMail({
      from: '"Event Management" <noreply@eventapp.com>', // sender address
      to: "test@example.com", // can be any fake email, it will appear in Mailtrap
      subject: "Test Email from Mailtrap",
      text: "Hello! This is a test email sent using Mailtrap + Nodemailer.",
      html: "<b>Hello!</b><br>This is a <i>test email</i> from Mailtrap + Nodemailer.",
    });

    console.log("✅ Email sent:", info.messageId);
  } catch (error) {
    console.error("❌ Error sending email:", error);
  }
}

sendTestEmail();
