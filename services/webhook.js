const express = require('express');
const { stripe } = require('./stripe');
const { subscriptionService } = require('./subscription');
const { userDBService } = require('./db');

const app = express();

const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        if (STRIPE_WEBHOOK_SECRET && stripe) {
            event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
        } else {
            // Если секрет вебхука не настроен (для тестирования)
            event = JSON.parse(req.body.toString());
        }
    } catch (err) {
        console.error(`[Stripe Webhook] Verification error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const chatId = session.client_reference_id || (session.metadata && session.metadata.chat_id);
                const customerId = session.customer;
                const subscriptionId = session.subscription;

                let expiresAt = null;
                if (subscriptionId && stripe) {
                    try {
                        const sub = await stripe.subscriptions.retrieve(subscriptionId);
                        if (sub && sub.current_period_end) {
                            expiresAt = new Date(sub.current_period_end * 1000);
                        }
                    } catch (e) {
                        console.error('[Stripe Webhook] Error fetching subscription:', e.message);
                    }
                }

                if (chatId) {
                    await subscriptionService.activateSubscription({
                        chat_id: chatId,
                        stripeCustomerId: customerId,
                        stripeSubscriptionId: subscriptionId,
                        expiresAt
                    });
                }
                break;
            }

            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const customerId = sub.customer;
                const chatId = sub.metadata && sub.metadata.chat_id;

                let user = null;
                if (chatId) {
                    user = await userDBService.get({ chat_id: String(chatId) });
                }
                if (!user && customerId) {
                    user = await userDBService.get({ stripeCustomerId: customerId });
                }

                if (user) {
                    if (sub.status === 'active') {
                        const expiresAt = new Date(sub.current_period_end * 1000);
                        await subscriptionService.activateSubscription({
                            chat_id: user.chat_id,
                            stripeCustomerId: customerId,
                            stripeSubscriptionId: sub.id,
                            expiresAt
                        });
                    } else if (sub.status === 'past_due' || sub.status === 'unpaid') {
                        await userDBService.update({ _id: user._id }, {
                            subscriptionStatus: 'past_due'
                        });
                    }
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                const customerId = sub.customer;
                const chatId = sub.metadata && sub.metadata.chat_id;

                let user = null;
                if (chatId) {
                    user = await userDBService.get({ chat_id: String(chatId) });
                }
                if (!user && customerId) {
                    user = await userDBService.get({ stripeCustomerId: customerId });
                }

                if (user) {
                    await subscriptionService.cancelSubscription({ chat_id: user.chat_id });
                    await subscriptionService.kickUser(user);
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const customerId = invoice.customer;
                const user = await userDBService.get({ stripeCustomerId: customerId });
                if (user) {
                    await userDBService.update({ _id: user._id }, {
                        subscriptionStatus: 'past_due'
                    });
                }
                break;
            }

            default:
                // Необработанное событие
                break;
        }

        res.json({ received: true });
    } catch (err) {
        console.error('[Stripe Webhook Handler] Error processing event:', err);
        res.status(500).send('Internal Server Error');
    }
});

function startWebhookServer() {
    return new Promise((resolve) => {
        app.listen(WEBHOOK_PORT, () => {
            console.log(`[Stripe Webhook] Server listening on port ${WEBHOOK_PORT}`);
            resolve(app);
        });
    });
}

module.exports = {
    startWebhookServer
};

