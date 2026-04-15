const nodemailer = require('nodemailer');
require('dotenv').config({ path: './.env' });

const transporter = nodemailer.createTransport({
    service: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
        user: "a838c5001@smtp-brevo.com",
        pass: "8mZVYRLb5xhWy0QT", 
    },
});

/**
 * @param {object} user 
 * @param {string} resetUrl
 */
exports.sendPasswordResetEmail = async (user, resetUrl) => {
    try {
        const greetingName = user.name || 'there';

        const mailOptions = {
            from: '"MediSign Security" <security@medisign.com>',
            to: user.email,
            subject: 'Reset Your MediSign Password 🔐',
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 500px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px; padding: 30px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #4A90E2; margin: 0;">Password Reset</h2>
                        <p style="font-size: 0.9em; color: #777;">MediSign AI Translator</p>
                    </div>
                    
                    <p>Hello <strong>${greetingName}</strong>,</p>
                    <p>We received a request to reset the password for your MediSign account. No changes have been made yet.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background-color: #4A90E2; color: white; padding: 14px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold; box-shadow: 0 4px 6px rgba(74, 144, 226, 0.2);">
                            Reset My Password
                        </a>
                    </div>
                    
                    <p style="font-size: 0.85em; color: #888; border-left: 3px solid #ff4d4f; padding-left: 10px;">
                        <strong>Note:</strong> This link is only valid for <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.
                    </p>
                    
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="font-size: 0.8em; color: #aaa; text-align: center;">
                        Sent with ❤️ from the MediSign AI Team
                    </p>
                </div>
            `
        };
        await transporter.sendMail(mailOptions);
        console.log(`Password reset email sent to ${user.email}`);
    } catch (error) {
        console.error('Error sending password reset email:', error);
    }
};
