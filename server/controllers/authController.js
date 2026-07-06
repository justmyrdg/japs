const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User } = require("../models");

const ROLE_REDIRECT = {
  owner: "/owner/dashboard",
  secretary: "/secretary/dashboard",
  audit_teller: "/audit-teller/dashboard",
  conductor: "/conductor/dashboard",
  driver: "/driver/dashboard",
};

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
};

const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required." });
  }

  const user = await User.findOne({ where: { username } });

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  if (!user.is_active) {
    return res.status(403).json({ message: "Account is deactivated." });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const token = jwt.sign(
    { id: user.id, employee_id: user.employee_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
  );

  res.cookie("token", token, COOKIE_OPTIONS);

  return res.status(200).json({
    redirectUrl: ROLE_REDIRECT[user.role] ?? "/dashboard",
    user: {
      id: user.id,
      employee_id: user.employee_id,
      username: user.username,
      role: user.role,
      first_name: user.first_name,
      middle_name: user.middle_name,
      last_name: user.last_name,
      email: user.email,
      contact_number: user.contact_number,
    },
  });
};

const logout = (req, res) => {
  res.clearCookie("token", COOKIE_OPTIONS);
  return res.status(200).json({ message: "Logged out successfully." });
};

module.exports = { login, logout };
