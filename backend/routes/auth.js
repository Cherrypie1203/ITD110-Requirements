const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

const normalizeUser = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  email: user.email,
  username: user.username,
  mobileNumber: user.mobileNumber,
  profilePhoto: user.profilePhoto,
  gender: user.gender,
  profession: user.profession
});

// Sign Up
router.post('/signup', async (req, res) => {
  try {
    const { fullName, username, email, mobileNumber, password } = req.body;

    if (!fullName || !username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }]
    });

    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      return res.status(400).json({ error: 'Username already taken' });
    }

    const user = new User({
      fullName,
      username: normalizedUsername,
      email: normalizedEmail,
      mobileNumber: mobileNumber || '',
      password
    });

    await user.save();

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'Registered successfully',
      token,
      user: normalizeUser(user)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { emailOrMobile, password } = req.body;

    const normalizedValue = emailOrMobile.trim().toLowerCase();

    // Find user by email, username, or mobile
    const user = await User.findOne({
      $or: [
        { email: normalizedValue },
        { username: normalizedValue },
        { mobileNumber: emailOrMobile }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, user: normalizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
