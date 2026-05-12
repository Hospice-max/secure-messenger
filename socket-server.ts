import http from 'http';
import { Server } from 'socket.io';
import { connectToDatabase } from './src/lib/mongodb';
import { verifyToken } from './src/lib/jwt';

const PORT = parseInt(process.env.SOCKET_PORT || '4000', 10);

const httpServer = http.createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

let dbConnected = false;

// Test MongoDB connection on startup
connectToDatabase()
  .then(() => {
    dbConnected = true;
    console.log('✓ MongoDB connected');
  })
  .catch((error) => {
    console.error('✗ MongoDB connection failed:', error.message);
    console.warn('Server will start but message persistence will fail. Ensure MongoDB is running on localhost:27017');
  });

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('Authentication error'));
    }

    socket.data.userId = payload.userId;
    socket.data.username = payload.username;
    next();
  } catch (error) {
    console.error('Socket auth failed:', error);
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`Socket connected for user ${socket.data.username}`);

  socket.on('join_room', (userId: string) => {
    socket.join(`user_${userId}`);
    console.log(`User ${socket.data.username} joined room user_${userId}`);
  });

  socket.on('leave_room', (userId: string) => {
    socket.leave(`user_${userId}`);
    console.log(`User ${socket.data.username} left room user_${userId}`);
  });

  socket.on('send_message', async (data) => {
    try {
      const { receiverId, encryptedContent, iv, type } = data;
      if (!receiverId || !encryptedContent || !iv) {
        socket.emit('error', { message: 'Requête de message invalide' });
        return;
      }

      const { db } = await connectToDatabase().catch((err) => {
        console.error('DB connection error in send_message:', err.message);
        throw new Error('Database unavailable');
      });

      const message = {
        senderId: socket.data.userId,
        receiverId,
        encryptedContent,
        iv,
        type: type || 'text',
        status: 'sent',
        timestamp: new Date(),
      };

      const result = await db.collection('messages').insertOne(message);
      const savedMessage = {
        ...message,
        _id: result.insertedId.toString(),
      };

      io.to(`user_${receiverId}`).emit('new_message', savedMessage);
      socket.emit('message_sent', savedMessage);
    } catch (error) {
      console.error('Error on send_message:', error);
      socket.emit('error', { message: 'Impossible d\'envoyer le message' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected for user ${socket.data.username}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Socket server running at http://localhost:${PORT}`);
});

// Graceful error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});
