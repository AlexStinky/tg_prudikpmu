const { userDBService } = require('./db');
const { sender } = require('./sender');
const messages = require('../scripts/messages');

const CHANNEL_ID = process.env.CHANNEL_ID;

class SubscriptionService {
    /**
     * Активация или продление подписки пользователю (вызывается из вебхука Stripe)
     */
    async activateSubscription({ chat_id, stripeCustomerId, stripeSubscriptionId, expiresAt }) {
        let user = await userDBService.get({ chat_id: String(chat_id) });
        if (!user) {
            user = await userDBService.create({
                chat_id: String(chat_id),
                lang: 'ru'
            });
        }

        // Если дата не передана (например, для разового платежа на 30 дней)
        const newExpiresAt = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const updateData = {
            subscriptionStatus: 'active',
            subscriptionExpiresAt: newExpiresAt,
            lastReminderDays: null,
            isActive: true
        };

        if (stripeCustomerId) updateData.stripeCustomerId = stripeCustomerId;
        if (stripeSubscriptionId) updateData.stripeSubscriptionId = stripeSubscriptionId;

        await userDBService.update({ chat_id: String(chat_id) }, updateData);

        // Разбанить в канале на случай, если пользователь был исключен ранее
        if (CHANNEL_ID) {
            await sender.unbanUser(CHANNEL_ID, chat_id);
        }

        // Генерируем персональную инвайт-ссылку (1 использование)
        let inviteLink = null;
        if (CHANNEL_ID) {
            try {
                const res = await sender.bot.telegram.createChatInviteLink(CHANNEL_ID, {
                    member_limit: 1,
                    name: `Sub: ${user.username || chat_id}`
                });
                inviteLink = res.invite_link;
            } catch (err) {
                console.error('[activateSubscription] Error creating invite link:', err.message);
            }
        }

        // Отправляем уведомление об успешной оплате и ссылку на канал
        const msg = messages.subscriptionActivated(user.lang || 'ru', newExpiresAt, inviteLink);
        sender.enqueue({
            chat_id: String(chat_id),
            message: msg
        });

        console.log(`[SubscriptionService] Activated subscription for ${chat_id} until ${newExpiresAt}`);
    }

    /**
     * Отмена или истечение подписки в Stripe
     */
    async cancelSubscription({ chat_id, stripeCustomerId }) {
        const query = chat_id ? { chat_id: String(chat_id) } : { stripeCustomerId };
        const user = await userDBService.get(query);
        if (!user) return;

        await userDBService.update({ _id: user._id }, {
            subscriptionStatus: 'canceled'
        });

        console.log(`[SubscriptionService] Canceled subscription for ${user.chat_id}`);
    }

    /**
     * Кик пользователя из канала при неоплате / истечении срока
     */
    async kickUser(user) {
        if (!CHANNEL_ID) {
            console.warn('[SubscriptionService] CHANNEL_ID is not configured, skipping kick');
            return;
        }

        try {
            // Чтобы кикнуть (а не оставить в вечном бане), делаем ban + unban
            await sender.banUser(CHANNEL_ID, user.chat_id);
            await sender.unbanUser(CHANNEL_ID, user.chat_id);

            await userDBService.update({ _id: user._id }, {
                subscriptionStatus: 'expired',
                joinedChannel: false
            });

            const msg = messages.subscriptionExpired(user.lang || 'ru');
            sender.enqueue({
                chat_id: user.chat_id,
                message: msg
            });

            console.log(`[SubscriptionService] Kicked user ${user.chat_id} due to expired subscription`);
        } catch (err) {
            console.error(`[SubscriptionService] Error kicking user ${user.chat_id}:`, err.message);
        }
    }

    /**
     * Отправка напоминания о скором завершении подписки
     */
    async sendReminder(user, daysLeft) {
        await userDBService.update({ _id: user._id }, {
            lastReminderDays: daysLeft
        });

        const msg = messages.subscriptionExpiringReminder(user.lang || 'ru', daysLeft, user.subscriptionExpiresAt);
        sender.enqueue({
            chat_id: user.chat_id,
            message: msg
        });

        console.log(`[SubscriptionService] Sent ${daysLeft}-day reminder to ${user.chat_id}`);
    }
}

const subscriptionService = new SubscriptionService();

module.exports = {
    subscriptionService
};

