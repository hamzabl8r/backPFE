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

exports.sendPasswordResetEmail = async (user, resetUrl) => {
    console.log("Attempting to send reset email to:", user.email);
    
    try {
        const mailOptions = {
            
    from: `"MediSign Security" <${process.env.SENDER_EMAIL}>`, 
    to: user.email,
    subject: 'Reset Your MediSign Password 🔐',
   
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2>Password Reset Request</h2>
                    <p>Click the link below to reset your password:</p>
                    <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none;">Reset Password</a>
                    <p>This link expires in 1 hour.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent successfully! ID:", info.messageId);
        return info;
    } catch (error) {
        console.error('CRITICAL MAILER ERROR:', error.message);
        throw error;
    }
};