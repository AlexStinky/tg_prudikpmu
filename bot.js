require('dotenv').config();
//require('./scripts/logger').start();

const mongoose = require('mongoose');

const { Telegraf } = require('telegraf');
const { Stage, session } = Telegraf;
const TelegrafI18n = require('telegraf-i18n/lib/i18n');
const rateLimit = require('telegraf-ratelimit');

const middlewares = require('./scripts/middlewares');

const { sender } = require('./services/sender');
const { schedulerService } = require('./services/scheduler');
const { startWebhookServer } = require('./services/webhook');

const DB_CONN = process.env.DB_CONN;
const BOT_TOKEN = process.env.BOT_TOKEN;

mongoose.connect(DB_CONN, {
	useUnifiedTopology: true,
	useNewUrlParser: true,
});

const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 100 });

const { telegram: tg } = bot;

const limitConfig = {
	window: 1000,
	limit: 1,
	onLimitExceeded: (ctx, next) => ctx.telegram.sendChatAction(ctx.from.id, 'typing'),
};

const i18n = new TelegrafI18n({
	directory: './locales',
	defaultLanguage: 'ru',
	sessionName: 'session',
	useSession: true,
	templateData: {
		pluralize: TelegrafI18n.pluralize, uppercase: (value) => value.toUpperCase(),
  	},
});

const stage = new Stage([]);

tg.callApi('getUpdates', { offset: -1, allowed_updates: ['message', 'callback_query', 'chat_join_request'] })
	.then(updates => updates.length && updates[0].update_id + 1)
	.then(offset => { if (offset) return tg.callApi('getUpdates', { offset, allowed_updates: ['message', 'callback_query', 'chat_join_request'] }); })
	.then(() => bot.launch({
		polling: {
			allowedUpdates: ['message', 'callback_query', 'chat_join_request']
		}
	}))
	.then(() => console.info('The bot is launched'))
	.catch(err => console.error(err));

bot.use((ctx, next) => {
	if (ctx.update && ctx.update.chat_join_request) {
		return middlewares.chatJoinRequest(ctx);
	}
	return next();
});

bot.use(session());
bot.use(i18n.middleware());
bot.use(stage.middleware());
bot.use(rateLimit(limitConfig));

bot.use(middlewares.start);
bot.use(middlewares.commands);
bot.use(middlewares.cb);

bot.catch(err => console.error(err));

bot.telegram.getMe().then((botInfo) => {
    const now = new Date();
    const botUsername = botInfo.username;

    console.log(now);
    console.log(`Username: @${botUsername}`);
});

(async () => {
    await sender.create(bot);

    // Запуск сервера вебхуков Stripe
    await startWebhookServer();

    // Запуск планировщика для напоминаний и кика
    schedulerService.start();
})();

process.once('SIGINT', async () => {
    await bot.stop();
    await mongoose.disconnect();
});
process.once('SIGTERM', async () => {
    await bot.stop();
    await mongoose.disconnect();
});
