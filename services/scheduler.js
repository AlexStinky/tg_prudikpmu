const cron = require('node-cron');
const { userDBService } = require('./db');
const { subscriptionService } = require('./subscription');

class SchedulerService {
    start() {
        console.log('[SchedulerService] Starting subscription checker (every hour)...');

        // Запуск каждый час на 0-й минуте: '0 * * * *'
        cron.schedule('0 * * * *', async () => {
            await this.checkSubscriptions();
        });

        // Также выполняем разовую проверку при старте
        setTimeout(() => {
            this.checkSubscriptions().catch(err => console.error('[SchedulerService] Initial check error:', err));
        }, 5000);
    }

    async checkSubscriptions() {
        const now = new Date();
        console.log(`[SchedulerService] Checking subscriptions at ${now.toISOString()}`);

        try {
            // 1. Ищем пользователей, чья подписка уже истекла
            const expiredUsers = await userDBService.getAll({
                subscriptionStatus: { $in: ['active', 'past_due'] },
                subscriptionExpiresAt: { $ne: null, $lt: now }
            });

            for (const user of expiredUsers) {
                console.log(`[SchedulerService] User ${user.chat_id} expired on ${user.subscriptionExpiresAt}`);
                await subscriptionService.kickUser(user);
            }

            // 2. Ищем пользователей, у кого подписка истекает скоро (за 3 дня или за 1 день)
            const activeUsers = await userDBService.getAll({
                subscriptionStatus: 'active',
                subscriptionExpiresAt: { $gt: now }
            });

            for (const user of activeUsers) {
                const diffMs = new Date(user.subscriptionExpiresAt) - now;
                const diffHours = diffMs / (1000 * 60 * 60);
                const diffDays = Math.ceil(diffHours / 24);

                // Напоминание за 3 дня (если еще не отправляли за 3 дня)
                if (diffDays <= 3 && diffDays > 1 && user.lastReminderDays !== 3) {
                    await subscriptionService.sendReminder(user, 3);
                }
                // Напоминание за 1 день (если осталось <= 24 часов и не отправляли за 1 день)
                else if (diffDays <= 1 && user.lastReminderDays !== 1) {
                    await subscriptionService.sendReminder(user, 1);
                }
            }
        } catch (error) {
            console.error('[SchedulerService] Error checking subscriptions:', error);
        }
    }
}

const schedulerService = new SchedulerService();

module.exports = {
    schedulerService
};

