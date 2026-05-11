'use client';

import { useAuth } from '@/components/AuthContext';
import Login from '@/components/Login';
import Chat from '@/components/Chat';

export default function Home() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-xl text-black">Chargement...</div>
      </div>
    );
  }

  return user ? <Chat /> : <Login />;
}
