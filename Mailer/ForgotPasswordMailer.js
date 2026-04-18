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

// Vérification
transporter.verify((error) => {
    if (error) {
        console.error('❌ SMTP Error:', error);
    } else {
        console.log('✅ SMTP Ready');
    }
});

exports.sendPasswordResetEmail = async (user, resetUrl) => {
    try {
        
        const mailOptions = {
    from: `"MediSign Security" <${process.env.SENDER_EMAIL}>`,
    to: user.email,
    subject: 'Reset Your Password 🔐',
    html: `
        <div style="background-color: #0F2854; padding: 40px; font-family: sans-serif; text-align: center;">
            <div style="background-color: #1C4D8D; max-width: 500px; margin: auto; padding: 30px; border-radius: 10px; border: 1px solid #4988C4;">
                <h2 style="color: #BDE8F5;">Password Reset</h2>
                <p style="color: #FFFFFF; font-size: 16px;">We received a request to reset your password. Click the button below to proceed:</p>
                <a href="${resetUrl}" style="display: inline-block; background-color: #4988C4; color: #FFFFFF; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0;">Reset Password</a>
                <p style="color: #BDE8F5; font-size: 12px;">This link will expire in 1 hour for your security.</p>
                <hr style="border: 0; border-top: 1px solid #4988C4; margin: 20px 0;">
                <p style="color: #FFFFFF; font-size: 12px;">If you did not request this, please ignore this email.</p>
            </div>
        </div>
    `
};

        const info = await transporter.sendMail(mailOptions);
        console.log("✅ Email sent:", info.messageId);

    } catch (error) {
        console.error("🚨 MAIL ERROR:", error);
        throw error;
    }
};