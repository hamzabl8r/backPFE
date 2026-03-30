const nodemailer = require('nodemailer');
require('dotenv').config({path: './.env'});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});



exports.handleContactForm = async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        console.log('this mailer data ', req.body)

        if (!name || !email || !subject || !message) {
            return res.status(400).json({ msg: 'Please fill out all fields.' });
        }

        const mailOptions = {
            from: "noreply@medibook.com",
            to: process.env.EMAIL_USER, 
            replyTo: email, 
            subject: `New Contact Form Message: ${subject}`,
            html: `
                <h2>You have received a new message from your website contact form.</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Message:</strong></p>
                <p>${message}</p>
            `
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ msg: 'Message sent successfully!' });

    } catch (error){
        console.error('Error sending contact email:', error);
        res.status(500).json({ msg: 'Server Error' });
    }
};