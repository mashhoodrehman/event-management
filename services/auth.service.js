const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/user.model");
const transporter = require("../config/email");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

function loadTemplate(fileName) {
  const filePath = path.join(__dirname, "..", "templates", fileName);
  return fs.readFileSync(filePath, "utf8");
}

// 🧠 Signup with email verification
const signup = async ({ name, email, password, type }) => {
  if (!["personal", "agency"].includes(type)) {
    throw new Error("Invalid user type. Must be 'personal' or 'agency'.");
  }

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) throw new Error("User already exists");

  const hashedPassword = await bcrypt.hash(password, 10);
  const verificationToken = crypto.randomBytes(32).toString("hex");

  const newUser = await User.create({
    name,
    email,
    password: hashedPassword,
    type, // 👈 added type
    verificationToken,
  });

  const verificationLink = `http://app-backend.cvvm9olplp-gjy3m9eyd48q.p.temp-site.link/api/auth/verify?token=${verificationToken}`;
  let emailTemplate = loadTemplate("verificationEmail.html");

  emailTemplate = emailTemplate
    .replace(/{{name}}/g, name)
    .replace(/{{type}}/g, type)
    .replace(/{{verificationLink}}/g, verificationLink)
    .replace(/{{year}}/g, new Date().getFullYear());

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Verify your account",
    html: emailTemplate,
    // html: `
    //   <h2>Welcome, ${name}!</h2>
    //   <p>Your account type: <b>${type}</b></p>
    //   <p>Click the link below to verify your account:</p>
    //   <a href="${verificationLink}" target="_blank">${verificationLink}</a>
    // `,
  });

  return {
    message: "User registered. Please check your email for verification link.",
  };
};

// 🔐 Login
const login = async ({ email, password }) => {
  const user = await User.findOne({ where: { email } });
  if (!user) throw new Error("User not found");

  if (!user.isVerified)
    throw new Error("Account not verified. Please check your email.");

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) throw new Error("Invalid password");

  const token = jwt.sign(
    { id: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, type: user.type },
  };
};

// ✅ Verify account
// const verifyAccount = async (token) => {
//   const user = await User.findOne({ where: { verificationToken: token } });

//   if (!user) throw new Error("Invalid or expired verification token");

//   user.isVerified = true;
//   user.verificationToken = null;
//   await user.save();

//   return { message: "Account verified successfully!" };
// };
const verifyAccount = async (token, res) => {
  const user = await User.findOne({ where: { verificationToken: token } });

  if (!user) {
    if (!user) throw new Error("Invalid or expired verification link");
  }

  user.isVerified = true;
  user.verificationToken = null;
  await user.save();

  let successHtml = loadTemplate("verificationSuccess.html");
  successHtml = successHtml.replace(
    /{{loginUrl}}/g,
    process.env.FRONTEND_LOGIN_URL
  );
  return successHtml;
};

// 👤 Get Profile
const getProfile = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: ["id", "name", "email", "type"],
  });
  if (!user) throw new Error("User not found");
  return user;
};

module.exports = {
  signup,
  login,
  verifyAccount,
  getProfile,
};
