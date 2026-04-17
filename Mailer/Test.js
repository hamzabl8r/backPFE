// Create a test file testReset.js
const { sendPasswordResetEmail } = require('./ForgotPasswordMailer.js');

async function test() {
    const user = { email: 'hamzabeji001@gmail.com' };
    const resetUrl = 'http://localhost:3000/reset/token123';
    await sendPasswordResetEmail(user, resetUrl);
}

test();