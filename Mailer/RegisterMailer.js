const nodemailer = require('nodemailer');
require('dotenv').config({path: './.env'});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS, 
    },
});

/**
 * @param {object} user - 
 */
const sendWelcomeEmail = async (user) => {
    try {
        const fullName = (user.firstName && user.lastName) 
            ? `${user.firstName} ${user.lastName}` 
            : (user.name || 'Valued User');

        const mailOptions = {
            from: '"MediSign AI" <noreply@medisign.com>',
            to: user.email,
            subject: 'Welcome to MediSign! 🤟✨',
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
                    <h2 style="color: #4A90E2; text-align: center;">Hello ${fullName},</h2>
                    <p>Welcome to <strong>MediSign</strong>, your AI-powered bridge to seamless communication!</p>
                    <p>We are thrilled to have you. With our real-time Sign Language to Text/Speech translator, you can now communicate effortlessly using our advanced AI technology.</p>
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; border-left: 4px solid #4A90E2;">
                        <p style="margin: 0;"><strong>What you can do now:</strong></p>
                        <ul>
                            <li>Translate sign language in real-time using your webcam.</li>
                            <li>Save your favorite translations to your personalized dictionary.</li>
                            <li>Use Text-to-Speech to make your voice heard.</li>
                        </ul>
                    </div>
                    <p>If you have any questions about using the AI features, our support team is always here to help.</p>
                    <br>
                    <p>Best regards,</p>
                    <p><strong>The MediSign AI Team</strong></p>
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