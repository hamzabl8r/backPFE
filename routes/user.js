const express = require("express");
const router = express.Router();
const User = require("../models/users");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  loginRules,
  registerRules,
  validation,
} = require("../middleware/validator");
const { isAuth } = require("../middleware/auth");
const users = require("../models/users");
const { sendWelcomeEmail } = require("../Mailer/RegisterMailer");
const { sendPasswordResetEmail } = require('../Mailer/ForgotPasswordMailer');
const crypto = require("crypto");



// --- Configuration Multer ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads/profile_pics';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });


router.put("/update-pic", isAuth, upload.single("profilePic"), async (req, res) => {
  try {
    console.log("=== UPLOAD DEBUG ===");
    console.log("User from token:", req.user._id);
    console.log("File received:", req.file);
    
    if (!req.file) {
      return res.status(400).send({ msg: "No file uploaded" });
    }
    
    const imagePath = `/uploads/profile_pics/${req.file.filename}`;
    console.log("Image path:", imagePath);
    
    // Utiliser l'ID du token au lieu de req.params.id
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { profilePic: imagePath } },
      { new: true }
    ).select('-password');
    
    console.log("Updated user:", updatedUser);
    
    if (!updatedUser) {
      return res.status(404).send({ msg: "User not found" });
    }
    
    res.status(200).send({ 
      user: updatedUser,
      msg: "Photo updated!" 
    });
    
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).send({ msg: error.message });
  }
});

// register route
router.post("/register", registerRules(), validation, async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    dateOfBirth,
    isAdmin
  } = req.body;

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send({ msg: "User already exists" });
    }
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      firstName,
      lastName,
      email,
      phoneNumber,
      password: hashedPassword,
      dateOfBirth,
      isAdmin
    });
    await newUser.save();
    // Create Token
    const payload = {
      id: newUser._id,
      name: newUser.name,
    };
    // Send welcome email
    if (newUser) {
  await sendWelcomeEmail(newUser); 
}
    const token = await jwt.sign(payload, process.env.SECRET_KEY, {
      expiresIn: "8640000",
    });
    console.log(token);

    res
      .status(201)
      .json({ user: newUser, msg: "User registered successfully" });
  } catch (error) {
    console.log(error);
  }
});

// Login route
router.post("/login", loginRules(), validation, async (req, res) => {
  const { email, password } = req.body;
  try {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).send({ msg: "User does not exist" });
    }
    // Compare Passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send({ msg: "Invalid credentials" });
    }
    // Create Token
    const payload = {
      id: user._id,
    };
    const token = await jwt.sign(payload, process.env.SECRET_KEY, {
      expiresIn: "8640000",
    });
    res.status(200).send({
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        dateOfBirth: user.dateOfBirth,
        isAdmin: user.isAdmin,
        profilePic: user.profilePic || null  
      },
      msg: "Connexion réussie, code envoyé",
      token: `Bearer ${token}`,
    });
  } catch (error) {
    console.log(error);
  }
});
// forgot password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ msg: "Email is required" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(404).json({ msg: "No account found with this email" });
        }

        // 🔥 GENERATE TOKEN
        const resetToken = crypto.randomBytes(32).toString('hex');

        // 🔥 HASH TOKEN (VERY IMPORTANT)
        const hashedToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpire = Date.now() + 3600000;

        await user.save();

        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

        console.log("🔑 Reset URL:", resetUrl);

        //  SEND MAIL
        await sendPasswordResetEmail(user, resetUrl);

        res.status(200).json({
            msg: "Reset link sent successfully"
        });

    } catch (error) {
        console.error("Forgot Password Error:", error);
        res.status(500).json({
            msg: "Server error"
        });
    }
});
// reset password
router.put('/reset-password/:token', async (req, res) => {
  try {
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ msg: "Invalid or expired token" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(req.body.password, salt);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({ msg: "Password reset successful" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "Server error" });
  }
});


// Current Route
router.get("/current", isAuth, async (req, res) => {
  res.status(200).send({ user: {
      _id: req.user._id,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      email: req.user.email,
      phoneNumber: req.user.phoneNumber,
      dateOfBirth: req.user.dateOfBirth,
      isAdmin: req.user.isAdmin,
      profilePic: req.user.profilePic || null  
    } });
});
// Find Route
router.get("/", async (req, res) => {
  try {
    let result = await users.find();
    res.send({ users: result, msg: "All users" });
  } catch (error) {
    console.log(error);
  }
});

// Get all Doctor
router.get("/doctor", async (req, res) => {
  try {
    let result = await users.find({ isAdmin: true });
    res.send({ users: result, msg: "All Doctor" });
  } catch (error) {
    console.log(error);
  }
});

// get patient by id
router.get("/:id", async (req, res) => {
  try {
    let result = await users.findById(req.params.id);
    res.send({ user: result, msg: "user by ID" });
  } catch (error) {
    console.log(error);
  }
});

// update user
router.put("/:id", async (req, res) => {
  try {
    const { password, ...otherUpdate } = req.body;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      otherUpdate.password = await bcrypt.hash(password, salt);
    }
    let result = await users.findByIdAndUpdate(
      req.params.id,
      { $set: otherUpdate },
      { new: true }
    );
    if (!result) {
      return res.status(404).send("user not Found");
    }
    res.send({ result, msg: "Updated" });
  } catch (error) {
    res.send(error);
  }
});

// delete user
router.delete("/:id", async (req, res) => {
  try {
    let result = await users.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).send("user not Found");
    }
    res.send("user has been deleted");
  } catch (error) {
    res.send(error);
  }
});

module.exports = router;
