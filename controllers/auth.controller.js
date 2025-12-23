const AuthService = require("../services/auth.service");

exports.signup = async (req, res) => {
  try {
    const response = await AuthService.signup(req.body);
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { token, user } = await AuthService.login(req.body);
    res.status(200).json({ message: "Login successful", token, user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// exports.verifyAccount = async (req, res) => {
//   try {
//     const { token } = req.query;
//     const response = await AuthService.verifyAccount(token);
//     res.status(200).json(response);
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// };

exports.verifyAccount = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send("Missing verification token");
    }

    // Get HTML page from service
    const html = await AuthService.verifyAccount(token);

    // Tell browser it's HTML and send it
    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  } catch (error) {
    console.error(error);
    return res
      .status(400)
      .send(error.message || "Invalid or expired verification link");
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await AuthService.getProfile(req.user.id);
    res.status(200).json({ user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
    try {
      const response = await AuthService.forgotPassword(req.body.email); 
      res.status(200).json(response);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;    
    const response = await AuthService.resetPassword(token, req.body.password); 
    res.status(200).json(response);
  } catch (error) {
      res.status(400).json({ error: error.message });
    }
;}
