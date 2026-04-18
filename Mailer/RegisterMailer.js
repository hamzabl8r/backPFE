const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config({ path: '../.env' });

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const sendWelcomeEmail = async (user) => {
    try {
        const mailOptions = {
    from: `"MediSign AI" <${process.env.SENDER_EMAIL}>`,
    to: user.email,
    subject: 'Welcome to MediSign AI 🎉',
    html: `
        <div style="background-color: #0F2854; padding: 40px; font-family: sans-serif; text-align: center;">
            <div style="background-color: #1C4D8D; max-width: 500px; margin: auto; padding: 30px; border-radius: 10px; border: 1px solid #4988C4;">
                <h1 style="color: #BDE8F5; margin-bottom: 10px;">Welcome, ${user.firstName} ${user.lastName}!</h1>
                <p style="color: #FFFFFF; font-size: 18px;">We're thrilled to have you join <strong>MediSign AI</strong>.</p>
                <p style="color: #FFFFFF; line-height: 1.6;">Our platform is designed to help you translate sign language in real-time. We can't wait to see how you use it!</p>
                <a href="https://your-app-link.com/login" style="display: inline-block; background-color: #4988C4; color: #FFFFFF; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 25px 0;">Get Started</a>
                <p style="color: #BDE8F5; font-size: 14px;">Need help? Reply to this email anytime.</p>
            </div>
            <p style="color: #4988C4; font-size: 12px; margin-top: 20px;">&copy; 2026 MediSign AI Team</p>
        </div>
    `
};

        await transporter.sendMail(mailOptions);
        console.log("✅ Welcome email sent");

    } catch (error) {
        console.error("❌ Welcome mail error:", error);
    }
};

module.exports = { sendWelcomeEmail };