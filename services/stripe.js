const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

class StripeService {
    /**
     * Создание Checkout-сессии для оплаты подписки.
     * Поддерживает как рекуррентный режим ('subscription'), так и разовый ('payment').
     */
    async createCheckoutSession({ chat_id, username }) {
        if (!stripe) {
            throw new Error('STRIPE_SECRET_KEY is not configured in .env');
        }

        const priceId = process.env.STRIPE_PRICE_ID;
        const successUrl = process.env.STRIPE_SUCCESS_URL || 'https://t.me';
        const cancelUrl = process.env.STRIPE_CANCEL_URL || 'https://t.me';
        const mode = process.env.STRIPE_CHECKOUT_MODE || 'subscription'; // 'subscription' or 'payment'

        const sessionPayload = {
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode,
            success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl,
            client_reference_id: String(chat_id),
            metadata: {
                chat_id: String(chat_id),
                username: username || ''
            }
        };

        if (mode === 'subscription') {
            sessionPayload.subscription_data = {
                metadata: {
                    chat_id: String(chat_id),
                    username: username || ''
                }
            };
        }

        const session = await stripe.checkout.sessions.create(sessionPayload);
        return session.url;
    }

    /**
     * Создание клиентского портала Stripe для управления подпиской/отмены
     */
    async createPortalSession(customerId, returnUrl) {
        if (!stripe) throw new Error('Stripe is not configured');
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl || 'https://t.me',
        });
        return portalSession.url;
    }
}

const stripeService = new StripeService();

module.exports = {
    stripeService,
    stripe
};

