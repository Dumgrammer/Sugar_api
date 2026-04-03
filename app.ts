import type { Request, Response } from 'express';

const express = require('express');
const app = express();
const morgan = require('morgan');
const path = require('path');
const adminRouter = require('./routes/admin');
const superAdminRouter = require('./routes/superAdmin');
const menuRouter = require('./routes/menu');
const paymentRouter = require('./routes/payment');
const analyticsRouter = require('./routes/analytics');
const orderRouter = require('./routes/order');
const inventoryRouter = require('./routes/inventory');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

app.use(cors({
    origin: [
      'http://localhost:5173',
      'https://project-sugar.vercel.app',
    ],
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
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Routes
app.get('/', (req: Request, res: Response) => {
    res.send('Sugar API is running');
});
app.use('/admins', adminRouter);
app.use('/super-admins', superAdminRouter);
app.use('/menus', menuRouter);
app.use('/payments', paymentRouter);
app.use('/analytics', analyticsRouter);
app.use('/orders', orderRouter);
app.use('/inventories', inventoryRouter);

module.exports = app;


