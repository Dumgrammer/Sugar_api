const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
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

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;

export {};