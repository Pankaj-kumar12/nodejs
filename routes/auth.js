const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ msg: "Invalid email" });
    if (!/^\d{10}$/.test(phone))
      return res.status(400).json({ msg: "Phone must be 10 digits" });
    if (password.length < 6)
      return res.status(400).json({ msg: "Password must be at least 6 chars" });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ msg: "Email already registered" });

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const user = new User({ name, email, phone, password: hashed });
    await user.save();

    // Create JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      msg: "User created successfully",
      user: { id: user._id, name: user.name, email: user.email },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// LOGIN (with optional 2FA token)
router.post("/login", async (req, res) => {
  try {
    const { email, password, token: twoFAToken } = req.body;
    if (!email || !password)
      return res.status(400).json({ msg: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

    if (user.isTwoFAEnabled) {
      if (!twoFAToken) {
        return res.status(206).json({ 
          msg: "2FA token required",
          twoFARequired: true,
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFASecret,
        encoding: "base32",
        token: twoFAToken,
        window: 1,
      });

      if (!verified) return res.status(400).json({ msg: "Invalid 2FA token" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      msg: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// Generate 2FA secret & QR code for a user
router.post("/2fa/setup", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ msg: "Email required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "User not found" });

    const secret = speakeasy.generateSecret({
      name: `YourApp (${user.email})`,
    });

    user.twoFASecret = secret.base32;
    await user.save();

    qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
      if (err) return res.status(500).json({ msg: "Error generating QR" });

      res.json({
        msg: "2FA secret generated",
        qrCodeUrl: data_url,
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

// Verify 2FA token (optional separate verification route)
router.post("/2fa/verify", async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!email || !token)
      return res.status(400).json({ msg: "Email and token required" });

    const user = await User.findOne({ email });
    if (!user || !user.twoFASecret)
      return res.status(400).json({ msg: "2FA not setup for user" });

    const verified = speakeasy.totp.verify({
      secret: user.twoFASecret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (verified) {
      if (!user.isTwoFAEnabled) {
        user.isTwoFAEnabled = true;
        await user.save();
      }
      res.json({ msg: "2FA verified successfully" });
    } else {
      res.status(400).json({ msg: "Invalid 2FA token" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
