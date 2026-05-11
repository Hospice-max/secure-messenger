'use client';

import { useEffect, useState, useRef } from 'react';

export interface SocketMessage {
  type: 'message' | 'typing' | 'user_status';
  data: unknown;
}

// Simple polling implementation for now
export function useSocketIO(token: string | null) {
  const [socket, setSocket] = useState<{ connected: boolean } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const messageCallbacksRef = useRef<Map<string, ((data: unknown) => void)[]>>(new Map());

  useEffect(() => {
    setTimeout(() => {
      setIsConnected(true);
      setSocket({ connected: true });
    }, 0);
  }, [token]);

  const sendMessage = (_type: string, data: unknown) => {
    // Mock implementation - messages are sent via API routes
    console.log('Mock socket send:', _type, data);
  };

  const onMessage = (type: string, callback: (data: unknown) => void) => {
    if (!messageCallbacksRef.current.has(type)) {
      messageCallbacksRef.current.set(type, []);
    }
    messageCallbacksRef.current.get(type)!.push(callback);
  };

  const offMessage = (type: string, callback?: (data: unknown) => void) => {
    if (callback) {
      const callbacks = messageCallbacksRef.current.get(type);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    } else {
      messageCallbacksRef.current.delete(type);
    }
  };

  return { socket, isConnected, sendMessage, onMessage, offMessage };
}
