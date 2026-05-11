'use client';

import { useEffect, useRef, useState } from 'react';

export interface SocketMessage {
  type: 'message' | 'typing' | 'user_status';
  data: any;
}

export class SocketService {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private connectionHandlers: (() => void)[] = [];
  private disconnectionHandlers: (() => void)[] = [];

  constructor(private token: string | null) {}

  connect() {
    if (!this.token) return;

    const wsUrl = process.env.NODE_ENV === 'production' 
      ? `wss://${window.location.host}/socket.io/?token=${this.token}`
      : `ws://localhost:3000/socket.io/?token=${this.token}`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.connectionHandlers.forEach(handler => handler());
      };

      this.socket.onmessage = (event) => {
        try {
          const message: SocketMessage = JSON.parse(event.data);
          const handlers = this.messageHandlers.get(message.type) || [];
          handlers.forEach(handler => handler(message.data));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.socket.onclose = () => {
        console.log('WebSocket disconnected');
        this.disconnectionHandlers.forEach(handler => handler());
        this.attemptReconnect();
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  sendMessage(type: string, data: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, data }));
    }
  }

  onMessage(type: string, handler: (data: any) => void) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  onConnect(handler: () => void) {
    this.connectionHandlers.push(handler);
  }

  onDisconnect(handler: () => void) {
    this.disconnectionHandlers.push(handler);
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

export function useSocket(token: string | null) {
  const [socket, setSocket] = useState<SocketService | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (token) {
      const socketService = new SocketService(token);
      
      socketService.onConnect(() => {
        setIsConnected(true);
      });

      socketService.onDisconnect(() => {
        setIsConnected(false);
      });

      socketService.connect();
      setSocket(socketService);

      return () => {
        socketService.disconnect();
      };
    }
  }, [token]);

  return { socket, isConnected };
}
