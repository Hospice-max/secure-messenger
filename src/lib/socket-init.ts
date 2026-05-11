import { Server as HTTPServer } from 'http';
import { NextApiRequest, NextApiResponse } from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { verifyToken } from './jwt';
import { connectToDatabase } from './mongodb';

export interface SocketUser {
  userId: string;
  username: string;
}

export interface NextApiResponseWithSocket extends NextApiResponse {
  socket: any;
}

export const initializeSocket = (req: NextApiRequest, res: NextApiResponseWithSocket) => {
  if (!res.socket.server.io) {
    console.log('Initializing Socket.IO server...');
    
    const httpServer: HTTPServer = res.socket.server as any;
    const io = new SocketIOServer(httpServer, {
      path: '/socket.io',
      addTrailingSlash: false,
      cors: {
        origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
        methods: ['GET', 'POST']
      }
    });

    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error'));
        }

        const decoded = verifyToken(token);
        if (!decoded) {
          return next(new Error('Invalid token'));
        }

        socket.data.userId = decoded.userId;
        socket.data.username = decoded.username;
        next();
      } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication error'));
      }
    });

    io.on('connection', (socket) => {
      console.log(`User ${socket.data.username} connected`);

      socket.on('join_room', (userId: string) => {
        socket.join(`user_${userId}`);
        console.log(`User ${socket.data.username} joined room for user ${userId}`);
      });

      socket.on('leave_room', (userId: string) => {
        socket.leave(`user_${userId}`);
        console.log(`User ${socket.data.username} left room for user ${userId}`);
      });

      socket.on('send_message', async (data) => {
        try {
          const { receiverId, encryptedContent, iv, type } = data;
          
          // Save message to database
          const { db } = await connectToDatabase();
          const message = {
            senderId: socket.data.userId,
            receiverId,
            encryptedContent,
            iv,
            type: type || 'text',
            timestamp: new Date()
          };

          const result = await db.collection('messages').insertOne(message);

          // Send to recipient
          io.to(`user_${receiverId}`).emit('new_message', {
            ...message,
            _id: result.insertedId.toString(),
            senderId: socket.data.userId,
            senderUsername: socket.data.username
          });

          // Send confirmation to sender
          socket.emit('message_sent', {
            ...message,
            _id: result.insertedId.toString()
          });
        } catch (error) {
          console.error('Error sending message:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      socket.on('typing_start', (receiverId: string) => {
        socket.to(`user_${receiverId}`).emit('user_typing', {
          userId: socket.data.userId,
          username: socket.data.username
        });
      });

      socket.on('typing_stop', (receiverId: string) => {
        socket.to(`user_${receiverId}`).emit('user_stop_typing', {
          userId: socket.data.userId,
          username: socket.data.username
        });
      });

      socket.on('disconnect', () => {
        console.log(`User ${socket.data.username} disconnected`);
      });
    });

    res.socket.server.io = io;
  }
  
  return res.socket.server.io;
};
