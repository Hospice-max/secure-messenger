'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { EncryptionService, EncryptedData } from '@/lib/encryption';
import { Message } from '@/lib/mongodb';
import { useSocketIO } from '@/lib/socketio';

interface User {
  _id: string;
  username: string;
  email: string;
}

interface ChatMessage extends Message {
  _id: string;
  isDecrypting?: boolean;
  decryptedContent?: string;
}

export default function Chat() {
  const { user, token, logout } = useAuth();
  const { socket, sendMessage: socketSendMessage } = useSocketIO(token);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const decryptMessage = useCallback((msg: ChatMessage) => {
    try {
      const encryptedData: EncryptedData = {
        data: msg.encryptedContent,
        iv: msg.iv
      };

      const partnerId = msg.senderId === user?.id ? msg.receiverId : msg.senderId;
      let decryptedContent: string;

      if (msg.type === 'image') {
        decryptedContent = EncryptionService.decryptImage(encryptedData, user!.id, partnerId);
      } else {
        decryptedContent = EncryptionService.decrypt(encryptedData, user!.id, partnerId);
      }

      setMessages(prev => prev.map((message) =>
        message._id === msg._id
          ? { ...message, isDecrypting: false, decryptedContent }
          : message
      ));
    } catch (error) {
      console.error('Error decrypting message:', error);
      setMessages(prev => prev.map((message) =>
        message._id === msg._id
          ? { ...message, isDecrypting: false, decryptedContent: '[Erreur de déchiffrement]' }
          : message
      ));
    }
  }, [user, token]);

  const scheduleDecryption = useCallback((msg: ChatMessage) => {
    setTimeout(() => decryptMessage(msg), 2000);
  }, [decryptMessage]);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, [token]);

  const fetchMessages = useCallback(async () => {
    if (!selectedUser) return;

    try {
      const response = await fetch(`/api/messages?receiverId=${selectedUser._id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        const messagesWithDecrypting = data.messages
          .map((msg: ChatMessage) => ({
            ...msg,
            isDecrypting: true,
            decryptedContent: undefined
          }))
          .reverse();

        setMessages(messagesWithDecrypting);

        if (messagesWithDecrypting.length > 0) {
          setLastMessageId(messagesWithDecrypting[0]._id);
        }

        messagesWithDecrypting.forEach((msg: ChatMessage) => {
          scheduleDecryption(msg);
        });
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, [selectedUser, token, scheduleDecryption]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedUser || !user) return;

    setIsLoading(true);
    try {
      const encryptedData = EncryptionService.encrypt(newMessage, user.id, selectedUser._id);

      const optimisticMessage: ChatMessage = {
        _id: `temp-${Date.now()}`,
        senderId: user.id,
        receiverId: selectedUser._id,
        encryptedContent: encryptedData.data,
        iv: encryptedData.iv,
        type: 'text',
        status: 'sent',
        timestamp: new Date(),
        isDecrypting: true,
        decryptedContent: undefined
      };

      setMessages(prev => [optimisticMessage, ...prev]);
      setNewMessage('');
      scheduleDecryption(optimisticMessage);

      if (socket) {
        socketSendMessage('send_message', {
          receiverId: selectedUser._id,
          encryptedContent: encryptedData.data,
          iv: encryptedData.iv,
          type: 'text'
        });
      } else {
        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            receiverId: selectedUser._id,
            encryptedContent: encryptedData.data,
            iv: encryptedData.iv,
            type: 'text'
          }),
        });

        if (!response.ok) {
          setMessages(prev => prev.filter(msg => msg._id !== optimisticMessage._id));
          console.error('Failed to send message');
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (socket && user) {
      socketSendMessage('join_room', user.id);
      return () => {
        socketSendMessage('leave_room', user.id);
      };
    }
  }, [socket, user, socketSendMessage]);

  useEffect(() => {
    if (!socket || !user) return;

    const handleNewMessage = (data: ChatMessage) => {
      const incomingMessage: ChatMessage = {
        ...data,
        _id: data._id,
        isDecrypting: true,
        decryptedContent: undefined
      };

      setMessages(prev => {
        if (prev.some(msg => msg._id === incomingMessage._id)) {
          return prev;
        }
        return [incomingMessage, ...prev];
      });

      scheduleDecryption(incomingMessage);
      setLastMessageId(incomingMessage._id);
    };

    const handleMessageSent = (data: ChatMessage) => {
      setMessages(prev => prev.map(msg =>
        msg._id.startsWith('temp-') && msg.receiverId === data.receiverId && msg.encryptedContent === data.encryptedContent
          ? { ...msg, _id: data._id, status: 'sent' }
          : msg
      ));
    };

    socket.on('new_message', handleNewMessage);
    socket.on('message_sent', handleMessageSent);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_sent', handleMessageSent);
    };
  }, [socket, user, scheduleDecryption]);

  useEffect(() => {
    setTimeout(() => fetchUsers(), 0);
  }, [fetchUsers]);

  useEffect(() => {
    if (selectedUser) {
      if (!messagesLoaded) {
        fetchMessages();
        setTimeout(() => setMessagesLoaded(true), 0);
      }
    } else {
      setTimeout(() => setMessagesLoaded(false), 0);
    }
  }, [selectedUser, messagesLoaded, fetchMessages]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser || !user) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const uploadData = await uploadResponse.json();
      const encryptedImage = EncryptionService.encryptImage(uploadData.imageData, user.id, selectedUser._id);

      const optimisticMessage: ChatMessage = {
        _id: `temp-${Date.now()}`,
        senderId: user.id,
        receiverId: selectedUser._id,
        encryptedContent: encryptedImage.data,
        iv: encryptedImage.iv,
        type: 'image',
        status: 'sent',
        timestamp: new Date(),
        isDecrypting: true,
        decryptedContent: undefined
      };

      setMessages(prev => [optimisticMessage, ...prev]);
      scheduleDecryption(optimisticMessage);

      if (socket) {
        socketSendMessage('send_message', {
          receiverId: selectedUser._id,
          encryptedContent: encryptedImage.data,
          iv: encryptedImage.iv,
          type: 'image'
        });
      } else {
        const messageResponse = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            receiverId: selectedUser._id,
            encryptedContent: encryptedImage.data,
            iv: encryptedImage.iv,
            type: 'image'
          }),
        });

        if (!messageResponse.ok) {
          setMessages(prev => prev.filter(msg => msg._id !== optimisticMessage._id));
          console.error('Failed to send image');
        }
      }
    } catch (error) {
      console.error('Error sending image:', error);
    }
    setIsLoading(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Mobile Menu Toggle */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setSelectedUser(null)}
          className="p-2 bg-white rounded-md shadow-md"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Sidebar */}
      <div className={`${selectedUser && 'hidden lg:block'} w-full lg:w-80 bg-white border-r border-gray-200 flex-shrink-0 fixed lg:relative h-full z-40`}>
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold text-black">Messagerie Sécurisée</h2>
              <p className="text-sm text-black font-medium mt-1">Connecté: {user?.username}</p>
            </div>
            <button
              onClick={logout}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Déconnexion
            </button>
          </div>
          <input
            type="text"
            placeholder="Rechercher des utilisateurs..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-black"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="overflow-y-auto" style={{ height: 'calc(100% - 140px)' }}>
          {filteredUsers.map((u) => (
            <div
              key={u._id}
              onClick={() => setSelectedUser(u)}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                selectedUser?._id === u._id ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="font-medium text-black">{u.username}</div>
              <div className="text-sm text-black">{u.email}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`${!selectedUser && 'hidden lg:block'} flex-1 flex flex-col min-w-0 lg:block relative`}>
        {selectedUser ? (
          <>
            {/* Header */}
            <div className="bg-white p-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-black">{selectedUser.username}</h3>
                  <p className="text-sm text-black">{selectedUser.email}</p>
                </div>
                <button
                  onClick={logout}
                  className="lg:hidden text-sm text-red-600 hover:text-red-800"
                >
                  Déconnexion
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
              {messages.map((message) => (
                <div
                  key={message._id}
                  className={`flex ${message.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.senderId === user?.id
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'bg-gray-200 text-black font-medium'
                    }`}
                  >
                    {message.type === 'image' ? (
                      message.isDecrypting ? (
                        <div className="space-y-2 p-4 text-left">
                          <div className="text-sm italic">🔒 Image chiffrée</div>
                          <div className="text-xs break-words bg-slate-100 text-slate-700 rounded px-3 py-2 font-mono overflow-x-auto">
                            {message.encryptedContent.slice(0, 120)}...
                          </div>
                        </div>
                      ) : message.decryptedContent && message.decryptedContent !== '[Erreur de déchiffrement]' ? (
                        <img
                          src={message.decryptedContent}
                          alt="Image partagée"
                          className="max-w-full h-auto rounded"
                        />
                      ) : (
                        <div className="flex items-center justify-center p-4">
                          <div className="text-sm italic">[Erreur de déchiffrement]</div>
                        </div>
                      )
                    ) : (
                      <div className="space-y-2">
                        {message.isDecrypting ? (
                          <div className="text-sm italic">🔒 Message chiffré</div>
                        ) : (
                          <div className="font-normal break-words">{message.decryptedContent}</div>
                        )}
                        {message.isDecrypting ? (
                          <div className="text-xs opacity-70">Déchiffrement en cours...</div>
                        ) : null}
                        <div className="text-xs opacity-70 mt-1">
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input - Fixed at bottom */}
            <div className="absolute bottom-0 left-0 right-0 bg-white p-4 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                  id="image-upload"
                />
                <label
                  htmlFor="image-upload"
                  className="px-4 py-2 bg-gray-200 text-black rounded-md hover:bg-gray-300 cursor-pointer text-sm whitespace-nowrap"
                >
                  📷 Image
                </label>
                
                <input
                  type="text"
                  placeholder="Taper un message..."
                  className="flex-1 px-4 py-2 text-black border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium min-w-0"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  disabled={isLoading}
                />
                
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !newMessage.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 font-medium whitespace-nowrap"
                >
                  {isLoading ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-black mb-2">
                Bienvenue dans la messagerie sécurisée
              </h3>
              <p className="text-black">
                Sélectionnez un utilisateur pour commencer à chatter
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
