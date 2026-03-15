import type { Request, Response } from 'express';

const express = require('express');
const app = express();
const morgan = require('morgan');
const adminRouter = require('./routes/admin');
const superAdminRouter = require('./routes/superAdmin');
const menuRouter = require('./routes/menu');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
}));



mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB connected');
    })
    .catch((error: unknown) => {
        console.error('MongoDB connection failed:', error);
    });
// Middleware
app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));
// Routes
app.get('/', (req: Request, res: Response) => {
    res.send('Sugar API is running');
});
app.use('/admins', adminRouter);
app.use('/super-admins', superAdminRouter);
app.use('/menus', menuRouter);

module.exports = app;


