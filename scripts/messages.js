const fs = require('fs');
const moment = require('moment');
const TelegrafI18n = require('telegraf-i18n/lib/i18n');

const i18n = new TelegrafI18n({
    directory: './locales',
    defaultLanguage: 'ru',
    sessionName: 'session',
    useSession: true,
    templateData: {
        pluralize: TelegrafI18n.pluralize,
        uppercase: (value) => value.toUpperCase()
    }
});

const text = (lang, key, data) => i18n.t(lang, key, data);

const formatDate = (date) => {
    if (!date) return '-';
    return moment(date).format('DD.MM.YYYY HH:mm');
};

const start = (lang, user, message_id = null) => {
    const isSubscribed = user && user.subscriptionStatus === 'active';

    let inline_keyboard = [];

    if (isSubscribed) {
        inline_keyboard.push([{
            text: i18n.t(lang, 'status_button'),
            callback_data: 'sub_status'
        }]);
        inline_keyboard.push([{
            text: i18n.t(lang, 'renew_button'),
            callback_data: 'sub_pay'
        }]);
    } else {
        inline_keyboard.push([{
            text: i18n.t(lang, 'subscribe_button'),
            callback_data: 'sub_pay'
        }]);
        inline_keyboard.push([{
            text: i18n.t(lang, 'status_button'),
            callback_data: 'sub_status'
        }]);
    }

    return {
        type: message_id ? 'edit_text' : 'text',
        message_id,
        text: i18n.t(lang, 'start_message'),
        extra: {
            reply_markup: {
                inline_keyboard
            }
        }
    };
};

const subscriptionStatus = (lang, user, message_id = null) => {
    const isSubscribed = user && user.subscriptionStatus === 'active';
    let textContent = '';

    if (isSubscribed) {
        textContent = i18n.t(lang, 'subscription_status_active', {
            expiresAt: formatDate(user.subscriptionExpiresAt)
        });
    } else {
        textContent = i18n.t(lang, 'subscription_status_none');
    }

    const inline_keyboard = [
        [{
            text: isSubscribed ? i18n.t(lang, 'renew_button') : i18n.t(lang, 'subscribe_button'),
            callback_data: 'sub_pay'
        }],
        [{
            text: i18n.t(lang, 'back_button'),
            callback_data: 'cancel'
        }]
    ];

    return {
        type: message_id ? 'edit_text' : 'text',
        message_id,
        text: textContent,
        extra: {
            reply_markup: {
                inline_keyboard
            }
        }
    };
};

const checkoutLink = (lang, checkoutUrl, message_id = null) => {
    return {
        type: message_id ? 'edit_text' : 'text',
        message_id,
        text: i18n.t(lang, 'subscription_checkout_message'),
        extra: {
            reply_markup: {
                inline_keyboard: [
                    [{
                        text: i18n.t(lang, 'subscription_checkout_button'),
                        url: checkoutUrl
                    }],
                    [{
                        text: i18n.t(lang, 'back_button'),
                        callback_data: 'cancel'
                    }]
                ]
            }
        }
    };
};

const subscriptionActivated = (lang, expiresAt, inviteLink) => {
    return {
        type: 'text',
        text: i18n.t(lang, 'subscription_activated_title', {
            expiresAt: formatDate(expiresAt),
            inviteLink: inviteLink ? `<a href="${inviteLink}">${inviteLink}</a>` : '<i>(Перевірте налаштування каналу)</i>'
        }),
        extra: {
            reply_markup: {
                inline_keyboard: inviteLink ? [
                    [{
                        text: '➡️ Перейти в канал',
                        url: inviteLink
                    }]
                ] : []
            }
        }
    };
};

const subscriptionExpiringReminder = (lang, days, expiresAt) => {
    return {
        type: 'text',
        text: i18n.t(lang, 'subscription_reminder_title', {
            days,
            expiresAt: formatDate(expiresAt)
        }),
        extra: {
            reply_markup: {
                inline_keyboard: [
                    [{
                        text: i18n.t(lang, 'renew_button'),
                        callback_data: 'sub_pay'
                    }]
                ]
            }
        }
    };
};

const subscriptionExpired = (lang) => {
    return {
        type: 'text',
        text: i18n.t(lang, 'subscription_expired_title'),
        extra: {
            reply_markup: {
                inline_keyboard: [
                    [{
                        text: i18n.t(lang, 'subscribe_button'),
                        callback_data: 'sub_pay'
                    }]
                ]
            }
        }
    };
};

module.exports = {
    text,
    start,
    subscriptionStatus,
    checkoutLink,
    subscriptionActivated,
    subscriptionExpiringReminder,
    subscriptionExpired
};
