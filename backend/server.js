require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.get('/', (req, res) => res.send('Anonymous Chat Server is running!'));

const messageCounts = {};
setInterval(() => {
  Object.keys(messageCounts).forEach(k => (messageCounts[k] = 0));
}, 1000);

async function getPartnerSocketId(userId) {
  const result = await pool.query(
    `SELECT s2.socket_id FROM sessions s1
     JOIN sessions s2 ON s2.id = s1.partner_id
     WHERE s1.id = $1`,
    [userId]
  );
  return result.rows[0]?.socket_id || null;
}

io.on('connection', async (socket) => {
  const userId = uuidv4();
  socket.userId = userId;

  try {
    await pool.query(
      `INSERT INTO sessions (id, socket_id, status) VALUES ($1, $2, 'idle')`,
      [userId, socket.id]
    );
  } catch (err) {
    console.error('Error creating session:', err.message);
  }

  socket.on('find_match', async () => {
    try {
      await pool.query(
        `UPDATE sessions SET status = 'waiting', partner_id = NULL WHERE id = $1`,
        [userId]
      );
      const result = await pool.query(
        `SELECT id, socket_id FROM sessions
         WHERE status = 'waiting' AND id != $1 LIMIT 1`,
        [userId]
      );
      if (result.rows.length > 0) {
        const partner = result.rows[0];
        await pool.query(
          `UPDATE sessions SET status = 'chatting', partner_id = $1 WHERE id = $2`,
          [partner.id, userId]
        );
        await pool.query(
          `UPDATE sessions SET status = 'chatting', partner_id = $1 WHERE id = $2`,
          [userId, partner.id]
        );
        socket.emit('matched');
        io.to(partner.socket_id).emit('matched');
      } else {
        socket.emit('waiting');
      }
    } catch (err) {
      console.error('Error in find_match:', err.message);
    }
  });

  socket.on('send_message', async ({ content }) => {
    try {
      if (!content || content.trim().length === 0) return;
      if (content.length > 500) {
        socket.emit('error_msg', 'Message too long (max 500 characters)');
        return;
      }
      messageCounts[socket.id] = (messageCounts[socket.id] || 0) + 1;
      if (messageCounts[socket.id] > 5) {
        socket.emit('error_msg', 'Slow down! Too many messages.');
        return;
      }
      const partnerSocketId = await getPartnerSocketId(userId);
      if (!partnerSocketId) {
        socket.emit('error_msg', 'No partner connected');
        return;
      }
      await pool.query(
        `INSERT INTO messages (session_id, sender_id, content) VALUES ($1, $2, $3)`,
        [userId, userId, content.trim()]
      );
      io.to(partnerSocketId).emit('receive_message', {
        content: content.trim(),
        from: 'partner',
        timestamp: new Date().toISOString()
      });
      socket.emit('receive_message', {
        content: content.trim(),
        from: 'me',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error in send_message:', err.message);
    }
  });

  socket.on('skip', async () => {
    try {
      const partnerSocketId = await getPartnerSocketId(userId);
      await pool.query(
        `UPDATE sessions SET status = 'idle', partner_id = NULL WHERE id = $1`,
        [userId]
      );
      if (partnerSocketId) {
        const partnerResult = await pool.query(
          `SELECT id FROM sessions WHERE socket_id = $1`,
          [partnerSocketId]
        );
        if (partnerResult.rows.length > 0) {
          await pool.query(
            `UPDATE sessions SET status = 'idle', partner_id = NULL WHERE id = $1`,
            [partnerResult.rows[0].id]
          );
        }
        io.to(partnerSocketId).emit('partner_disconnected');
      }
      socket.emit('skipped');
    } catch (err) {
      console.error('Error in skip:', err.message);
    }
  });

  socket.on('disconnect', async () => {
    try {
      const partnerSocketId = await getPartnerSocketId(userId);
      if (partnerSocketId) {
        const partnerResult = await pool.query(
          `SELECT id FROM sessions WHERE socket_id = $1`,
          [partnerSocketId]
        );
        if (partnerResult.rows.length > 0) {
          await pool.query(
            `UPDATE sessions SET status = 'idle', partner_id = NULL WHERE id = $1`,
            [partnerResult.rows[0].id]
          );
        }
        io.to(partnerSocketId).emit('partner_disconnected');
      }
      await pool.query(`DELETE FROM sessions WHERE id = $1`, [userId]);
    } catch (err) {
      console.error('Error in disconnect:', err.message);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));