const messages = require('./messages');

const { sender } = require('../services/sender');
const { userDBService } = require('../services/db');
const { stripeService } = require('../services/stripe');

const ADMINS = process.env.ADMINS ? process.env.ADMINS.split(',') : [];

const LANGUAGES = /uk|ru|en/;

const start = async (ctx, next) => {
    const { message } = ctx.update.callback_query || ctx.update;

    if (message) {
        try {
            ctx.state.user = await userDBService.get({ chat_id: String(ctx.from.id) });

            if (message.chat.type === 'private') {
                const lang = (LANGUAGES.test(ctx.from.language_code)) ?
                    ctx.from.language_code : 'ru';
                const username = ctx.chat.username || ctx.from.username || ctx.from.first_name;

                if (!ctx.state.user) {
                    const user = {
                        chat_id: String(ctx.from.id),
                        username,
                        lang
                    };

                    ctx.state.user = await userDBService.create(user);
                }

                await ctx.i18n.locale(ctx.state.user.lang || lang);

                if (ctx.state.user.username !== username || ctx.state.user.lang !== lang) {
                    ctx.state.user = await userDBService.update({ chat_id: String(ctx.from.id) }, {
                        isActive: true,
                        lang: ctx.state.user.lang || lang,
                        username
                    }, 'after');
                }
            }
        } catch (error) {
            console.error('[Middleware start error]:', error);
        }
    }

    return next();
};

const commands = async (ctx, next) => {
    const { message } = ctx.update;
    const { user } = ctx.state;

    if (message && message.text) {
        const { text } = message;
        const match = text.split(' ');
        const chat_id = message.chat.id;
        let response_message = null;

        if (message.chat.type === 'private') {
            if (match[0] === '/start') {
                response_message = messages.start(user.lang, user);
                await ctx.scene.leave();
            } else if (match[0] === '/status') {
                response_message = messages.subscriptionStatus(user.lang, user);
            } else if (match[0] === '/subscribe' || match[0] === '/pay') {
                try {
                    const checkoutUrl = await stripeService.createCheckoutSession({
                        chat_id: user.chat_id,
                        username: user.username
                    });
                    response_message = messages.checkoutLink(user.lang, checkoutUrl);
                } catch (e) {
                    await ctx.reply(`Помилка формування посилання: ${e.message}`);
                }
            }

            if (text === ctx.i18n.t('cancel_button')) {
                response_message = messages.start(user.lang, user);
                await ctx.replyWithHTML('👍', {
                    reply_markup: {
                        remove_keyboard: true
                    }
                });
                await ctx.scene.leave();
            }

            if (user && (user.isAdmin || ADMINS.includes(String(user.chat_id)))) {
                if (match[0] === '/admin') {
                    const check = await userDBService.get({
                        $or: [
                            { chat_id: match[1] },
                            { username: match[1] }
                        ]
                    });

                    if (check) {
                        check.isAdmin = (user.chat_id === check.chat_id) ?
                            true : !check.isAdmin;

                        await userDBService.update({ chat_id: check.chat_id }, check);
                        await ctx.reply(`Статус адміністратора для ${check.username || check.chat_id}: ${check.isAdmin ? '✅' : '❌'}`);
                    }
                }
            }
        }

        if (response_message) {
            sender.enqueue({
                chat_id,
                message: response_message
            });
        }
    }

    return next();
};

const cb = async (ctx, next) => {
    const { callback_query } = ctx.update;
    const { user } = ctx.state;

    if (callback_query) {
        const { message } = callback_query;
        const message_id = message.message_id;
        const chat_id = message.chat.id;
        const data = callback_query.data;

        let deleteMessage = false;
        let response_message = null;
        let answer = null;

        if (callback_query.message.chat.type === 'private') {
            if (data === 'cancel') {
                response_message = messages.start(user.lang, user, message_id);
                await ctx.scene.leave();
            } else if (data === 'sub_status') {
                response_message = messages.subscriptionStatus(user.lang, user, message_id);
            } else if (data === 'sub_pay') {
                try {
                    const checkoutUrl = await stripeService.createCheckoutSession({
                        chat_id: user.chat_id,
                        username: user.username
                    });
                    response_message = messages.checkoutLink(user.lang, checkoutUrl, message_id);
                } catch (e) {
                    answer = `Помилка Stripe: ${e.message}`;
                }
            }
        }

        if (deleteMessage) {
            await sender.deleteMessage(chat_id, message_id);
        }

        if (answer) {
            await ctx.answerCbQuery(answer, true);
        } else {
            await ctx.answerCbQuery().catch(() => {});
        }

        if (response_message) {
            sender.enqueue({
                chat_id,
                message: response_message
            });
        }
    }

    return next();
};

module.exports = {
    start,
    commands,
    cb
};
