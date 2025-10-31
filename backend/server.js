// backend/server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');
const apiRoutes = require('./routes/api');
const { mqttClient, setIO } = require('./mqtt'); // <- chú ý destructure

const app = express();
app.use(cors());
app.use(express.json());

// serve frontend
app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use('/api', apiRoutes);
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'))
);

// HTTP + Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log(' WS client connected:', socket.id);
});

// inject socket.io vào mqtt module (để mqtt.js emit được)
setIO(io);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(' Server running on port', PORT);
});
