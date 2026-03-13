require('dotenv').config({ path: '/Users/mashhoodrehman/Herd/event-management/.env' });
const Payment = require('./models/payment.model');

async function checkPayments() {
    try {
        const payments = await Payment.findAll({
            where: { eventId: 39 },
            order: [['createdAt', 'DESC']]
        });

        console.log('--- Payments for Event 39 ---');
        payments.forEach(p => {
            console.log(`- ${p.type}: ${p.status}, Amount: ${p.amount}, Intent: ${p.paymentIntentId}`);
        });
    } catch (error) {
        console.error('Error checking payments:', error.message);
    } finally {
        process.exit();
    }
}

checkPayments();
