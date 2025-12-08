const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 🧩 Ensure upload directories exist
const ensureUploadDirs = () => {
  const dirs = ["uploads/invitations", "uploads/guests"];
  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};
ensureUploadDirs();

// 📦 Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 📁 Route files based on field name
    if (file.fieldname === "guestListFile") {
      cb(null, "uploads/guests");
    } else {
      cb(null, "uploads/invitations");
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname.replace(
      /\s+/g,
      "_"
    )}`;
    cb(null, uniqueName);
  },
});

// 🧠 File filter
const fileFilter = (req, file, cb) => {
  const invitationTypes = ["image/jpeg", "image/png", "application/pdf"];
  const guestListTypes = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  if (
    (file.fieldname === "invitationFile" &&
      invitationTypes.includes(file.mimetype)) ||
    (file.fieldname === "guestListFile" &&
      guestListTypes.includes(file.mimetype))
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        file.fieldname === "guestListFile"
          ? "Invalid guest list file type. Only CSV or Excel allowed."
          : "Invalid invitation file type. Only JPG, PNG, or PDF allowed."
      ),
      false
    );
  }
};

// 🧰 Multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // limit: 5 MB
});

module.exports = upload;

// const multer = require("multer");
// const path = require("path");

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/invitations"); // folder path
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + path.extname(file.originalname));
//   },
// });

// const fileFilter = (req, file, cb) => {
//   const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
//   if (allowedTypes.includes(file.mimetype)) cb(null, true);
//   else cb(new Error("Invalid file type. Only JPG, PNG, PDF allowed."), false);
// };

// const upload = multer({ storage, fileFilter });

// module.exports = upload;
