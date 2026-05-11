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
  const { sendMessage: socketSendMessage } = useSocketIO(token);
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

  const decryptMessage = useCallback((msg: ChatMessage, index: number) => {
    try {
      const encryptedData: EncryptedData = {
        data: msg.encryptedContent,
        iv: msg.iv
      };
      
      let decryptedContent: string;
      if (msg.type === 'image') {
        decryptedContent = EncryptionService.decryptImage(encryptedData, user!.id, token || undefined);
      } else {
        decryptedContent = EncryptionService.decrypt(encryptedData, user!.id, token || undefined);
      }
      
      setMessages(prev => prev.map((message, i) => 
        i === index 
          ? { ...message, isDecrypting: false, decryptedContent }
          : message
      ));
    } catch (error) {
      console.error('Error decrypting message:', error);
      setMessages(prev => prev.map((message, i) => 
        i === index 
          ? { ...message, isDecrypting: false, decryptedContent: '[Erreur de déchiffrement]' }
          : message
      ));
    }
  }, [user, token]);

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

  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
        const messagesWithDecrypting = data.messages.map((msg: ChatMessage) => {
          const existingMessage = messagesRef.current.find(m => m._id === msg._id);
          if (existingMessage && existingMessage.decryptedContent && !existingMessage.isDecrypting) {
            return existingMessage;
          }
          return {
            ...msg,
            isDecrypting: true,
            decryptedContent: msg.type === 'image' ? undefined : undefined
          };
        });
        
        setMessages(messagesWithDecrypting.reverse());
        
        // Set the last message ID to track new messages
        if (data.messages.length > 0) {
          setLastMessageId(data.messages[0]._id);
        }

        data.messages.forEach((msg: ChatMessage, index: number) => {
          const existingMessage = messagesRef.current.find(m => m._id === msg._id);
          if (!existingMessage || existingMessage.isDecrypting) {
            setTimeout(() => {
              decryptMessage(msg, index);
            }, 100);
          }
        });
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, [selectedUser, token, decryptMessage]);


  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedUser) return;

    setIsLoading(true);
    try {
      const encryptedData = EncryptionService.encrypt(newMessage, user!.id, token || undefined);

      // Create optimistic message immediately
      const optimisticMessage: ChatMessage = {
        _id: `temp-${Date.now()}`,
        senderId: user!.id,
        receiverId: selectedUser._id,
        encryptedContent: encryptedData.data,
        iv: encryptedData.iv,
        type: 'text',
        status: 'sent',
        timestamp: new Date(),
        isDecrypting: false,
        decryptedContent: newMessage
      };

      // Add message immediately to UI
      setMessages(prev => [optimisticMessage, ...prev]);
      setNewMessage('');

      // Send via API route
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
        // Remove optimistic message if send failed
        setMessages(prev => prev.filter(msg => msg._id !== optimisticMessage._id));
        console.error('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
    setIsLoading(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser) return;

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
      const encryptedImage = EncryptionService.encryptImage(uploadData.imageData, user!.id, token || undefined);

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

      if (messageResponse.ok) {
        fetchMessages();
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

  useEffect(() => {
    setTimeout(() => fetchUsers(), 0);
  }, [fetchUsers]);

  useEffect(() => {
    if (selectedUser) {
      // Load initial messages only once
      if (!messagesLoaded) {
        fetchMessages();
        setTimeout(() => setMessagesLoaded(true), 0);
      }
      
      socketSendMessage('join_room', selectedUser._id);
      
      return () => {
        socketSendMessage('leave_room', selectedUser._id);
      };
    } else {
      setTimeout(() => setMessagesLoaded(false), 0);
    }
  }, [selectedUser, socketSendMessage, messagesLoaded, fetchMessages]);

  // Check for new messages only when needed
  const checkForNewMessages = useCallback(async () => {
    if (!selectedUser) return;

    try {
      const response = await fetch(`/api/messages?receiverId=${selectedUser._id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        const latestMessage = data.messages[0];
        if (latestMessage && (!lastMessageId || latestMessage._id !== lastMessageId)) {
          // New message detected
          const messageWithDecrypting = {
            ...latestMessage,
            isDecrypting: true,
            decryptedContent: latestMessage.type === 'image' ? undefined : undefined
          };
          
          setMessages(prev => {
            // Avoid duplicates
            const exists = prev.some(msg => msg._id === latestMessage._id);
            if (exists) return prev;
            return [messageWithDecrypting, ...prev];
          });
          
          setLastMessageId(latestMessage._id);
          
          setTimeout(() => {
            decryptMessage(messageWithDecrypting, 0);
          }, 100);
        }
      }
    } catch (error) {
      console.error('Error checking new messages:', error);
    }
  }, [selectedUser, token, lastMessageId, decryptMessage]);

  // Check for new messages after sending a message
  useEffect(() => {
    if (messages.length > 0 && messages[0]._id.startsWith('temp-')) {
      // Message was just sent optimistically, check for real message
      setTimeout(checkForNewMessages, 1000);
    }
  }, [messages, checkForNewMessages]);

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
                        <div className="flex items-center justify-center p-4">
                          <div className="text-sm italic">🔒 En train de déchiffrer...</div>
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
                      <div>
                        {message.isDecrypting ? (
                          <div className="text-sm italic">🔒 En train de déchiffrer...</div>
                        ) : (
                          <div className="font-normal">{message.decryptedContent}</div>
                        )}
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
