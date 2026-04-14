require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'], credentials: false }
});

app.use(cors({ origin: '*' }));
app.use(express.json());
app.get('/', (req, res) => res.send('Anonymous Chat Server is running!'));

// In-memory storage
const waitingUsers = [];
const pairs = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('find_match', () => {
    // Remove from waiting if already there
    const idx = waitingUsers.indexOf(socket.id);
    if (idx !== -1) waitingUsers.splice(idx, 1);

    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift();
      pairs[socket.id] = partnerId;
      pairs[partnerId] = socket.id;
      socket.emit('matched');
      io.to(partnerId).emit('matched');
      console.log('Matched:', socket.id, '<->', partnerId);
    } else {
      waitingUsers.push(socket.id);
      socket.emit('waiting');
      console.log('Waiting:', socket.id);
    }
  });

  socket.on('send_message', ({ content }) => {
    if (!content || content.trim().length === 0) return;
    if (content.length > 500) {
      socket.emit('error_msg', 'Message too long!');
      return;
    }
    const partnerId = pairs[socket.id];
    if (!partnerId) {
      socket.emit('error_msg', 'No partner connected');
      return;
    }
    io.to(partnerId).emit('receive_message', {
      content: content.trim(),
      from: 'partner',
      timestamp: new Date().toISOString()
    });
    socket.emit('receive_message', {
      content: content.trim(),
      from: 'me',
      timestamp: new Date().toISOString()
    });
  });

  socket.on('skip', () => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('partner_disconnected');
      delete pairs[partnerId];
    }
    delete pairs[socket.id];
    socket.emit('skipped');
  });

  socket.on('disconnect', () => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('partner_disconnected');
      delete pairs[partnerId];
    }
    delete pairs[socket.id];
    const idx = waitingUsers.indexOf(socket.id);
    if (idx !== -1) waitingUsers.splice(idx, 1);
    console.log('Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));