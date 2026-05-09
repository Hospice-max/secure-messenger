'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { EncryptionService, EncryptedData } from '@/lib/encryption';
import { Message } from '@/lib/mongodb';

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
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchUsers = async () => {
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
  };

  const fetchMessages = async () => {
    if (!selectedUser) return;

    try {
      const response = await fetch(`/api/messages?receiverId=${selectedUser._id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (response.ok) {
        const messagesWithDecrypting = data.messages.map((msg: ChatMessage) => ({
          ...msg,
          isDecrypting: true,
          decryptedContent: msg.type === 'image' ? undefined : undefined
        }));
        setMessages(messagesWithDecrypting.reverse());

        data.messages.forEach((msg: ChatMessage, index: number) => {
          setTimeout(() => {
            decryptMessage(msg, index);
          }, 2000);
        });
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const decryptMessage = (msg: ChatMessage, index: number) => {
    try {
      const encryptedData: EncryptedData = {
        data: msg.encryptedContent,
        iv: msg.iv
      };
      
      let decryptedContent: string;
      if (msg.type === 'image') {
        decryptedContent = EncryptionService.decryptImage(encryptedData, user!.id);
      } else {
        decryptedContent = EncryptionService.decrypt(encryptedData, user!.id);
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
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedUser) return;

    setIsLoading(true);
    try {
      const encryptedData = EncryptionService.encrypt(newMessage, user!.id);

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

      if (response.ok) {
        setNewMessage('');
        fetchMessages();
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
      const encryptedImage = EncryptionService.encryptImage(uploadData.imageData, user!.id);

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
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages();
      const interval = setInterval(fetchMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedUser]);

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex-shrink-0">
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Messagerie Sécurisée</h2>
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="overflow-y-auto" style={{ height: 'calc(100% - 120px)' }}>
          {filteredUsers.map((u) => (
            <div
              key={u._id}
              onClick={() => setSelectedUser(u)}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                selectedUser?._id === u._id ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="font-medium">{u.username}</div>
              <div className="text-sm text-gray-500">{u.email}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedUser ? (
          <>
            {/* Header */}
            <div className="bg-white p-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-semibold">{selectedUser.username}</h3>
              <p className="text-sm text-gray-500">{selectedUser.email}</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message._id}
                  className={`flex ${message.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.senderId === user?.id
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'bg-gray-200 text-gray-900 font-medium'
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

            {/* Input */}
            <div className="bg-white p-4 border-t border-gray-200 flex-shrink-0">
              <div className="flex space-x-2">
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
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 cursor-pointer"
                >
                  📷 Image
                </label>
                
                <input
                  type="text"
                  placeholder="Taper un message..."
                  className="flex-1 px-4 py-2 text-black border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  disabled={isLoading}
                />
                
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !newMessage.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 font-medium"
                >
                  {isLoading ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                Bienvenue dans la messagerie sécurisée
              </h3>
              <p className="text-gray-500">
                Sélectionnez un utilisateur pour commencer à chatter
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
