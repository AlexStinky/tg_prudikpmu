const { User } = require('../models/User');

class DBMethods {
    constructor(model) {
        this.Model = model;
    }

    async create(data) {
        return await this.Model.create(data);
    }

    async get(req) {
        return await this.Model.findOne(req);
    }

    async getAll(req, score = {}, sort = {}, limit = false) {
        return (limit) ?
            await this.Model.find(req, score).sort(sort).limit(limit) :
            await this.Model.find(req);
    }

    async update(req, update, returnDocument = 'before', upsert) {
        return await this.Model.findOneAndUpdate(req, update, {
            upsert,
            returnDocument
        });
    }

    async updateAll(req, update) {
        return await this.Model.updateMany(req, update);
    }

    async delete(req) {
        return await this.Model.findOneAndDelete(req);
    }

    async deleteAll(req) {
        return await this.Model.deleteMany(req);
    }

    async getCount(req) {
        return await this.Model.find(req).countDocuments();
    }

    async dropCollection () {
        return await this.Model.collection.drop();
    }
}

const userDBService = new DBMethods(User);

module.exports = {
    userDBService
}