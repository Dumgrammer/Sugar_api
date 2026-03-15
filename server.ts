require('dotenv').config();
const appModule = require('./app');
const port = process.env.PORT;
const http = require('http');

const server = http.createServer(appModule);

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

export {};
