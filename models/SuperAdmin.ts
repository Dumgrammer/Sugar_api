const mongoose = require('mongoose');

const superAdminSchema = new mongoose.Schema({
    f_name: {
        type: String,
        required: true,
    },
    m_name: {
        type: String,
        required: true,
    },
    l_name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
});

const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);

module.exports = SuperAdmin;

export {};
