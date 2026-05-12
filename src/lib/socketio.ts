'use client';

import { useCallback, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000';

export type SocketEvent = 'new_message' | 'message_sent' | 'user_typing' | 'user_stop_typing';

export function useSocketIO(token: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const socketClient = io(SOCKET_SERVER_URL, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
    });

    socketClient.on('connect', () => {
      setIsConnected(true);
    });

    socketClient.on('disconnect', () => {
      setIsConnected(false);
    });

    socketClient.on('connect_error', (error) => {
      console.error('Socket connect error:', error);
    });

    setSocket(socketClient);

    return () => {
      socketClient.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [token]);

  const sendMessage = useCallback(
    (event: string, data: unknown) => {
      socket?.emit(event, data);
    },
    [socket]
  );

  const onMessage = useCallback(
    (event: string, callback: (data: unknown) => void) => {
      socket?.on(event, callback);
      return () => {
        socket?.off(event, callback);
      };
    },
    [socket]
  );

  return { socket, isConnected, sendMessage, onMessage };
}
