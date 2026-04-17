const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

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
        const fullName = (user.firstName && user.lastName) 
            ? `${user.firstName} ${user.lastName}` 
            : (user.name || 'Valued User');

        const mailOptions = {
            from: `"MediSign AI" <hamzabeji001@gmail.com>`, // Changed
    to: user.email,
    subject: 'Welcome to MediSign! 🤟✨',
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
                    <h2 style="color: #4A90E2; text-align: center;">Hello ${fullName},</h2>
                    <p>Welcome to <strong>MediSign</strong>, your AI-powered bridge to seamless communication!</p>
                    <p>We are thrilled to have you onboard.</p>
                    <p>Best regards,<br>The MediSign Team</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Welcome email sent successfully to ${user.email}`);

    } catch (error) {
        console.error('Error sending welcome email:', error);
    }
};

module.exports = { sendWelcomeEmail };