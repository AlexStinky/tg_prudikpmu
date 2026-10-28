const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    chat_id: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    username: {
        type: String,
        default: null
    },
    lang: {
        type: String,
        default: 'en'
    },
    from: {
        type: String,
        default: 'organic'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    subscriptionStatus: {
        type: String,
        enum: ['none', 'active', 'past_due', 'canceled', 'expired'],
        default: 'none',
        index: true
    },
    subscriptionExpiresAt: {
        type: Date,
        default: null,
        index: true
    },
    stripeCustomerId: {
        type: String,
        default: null
    },
    stripeSubscriptionId: {
        type: String,
        default: null
    },
    lastReminderDays: {
        type: Number,
        default: null
    },
    joinedChannel: {
        type: Boolean,
        default: false
    }
}, {
    versionKey: false,
    timestamps: true
});

const User = mongoose.model('User', UserSchema);

module.exports = {
    User
};
