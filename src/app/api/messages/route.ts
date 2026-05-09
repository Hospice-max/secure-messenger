import { NextRequest, NextResponse } from 'next/server';
import { getMessagesCollection, Message } from '@/lib/mongodb';
import { verifyToken, getTokenFromHeaders } from '@/lib/jwt';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request.headers);
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const receiverId = searchParams.get('receiverId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!receiverId) {
      return NextResponse.json({ error: 'receiverId requis' }, { status: 400 });
    }

    const messagesCollection = await getMessagesCollection();
    
    const messages = await messagesCollection
      .find({
        $or: [
          { senderId: payload.userId, receiverId },
          { senderId: receiverId, receiverId: payload.userId }
        ]
      })
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return NextResponse.json({ messages });

  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des messages' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request.headers);
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    }

    const { receiverId, encryptedContent, iv, type }: Omit<Message, '_id' | 'senderId' | 'timestamp' | 'status'> = await request.json();

    if (!receiverId || !encryptedContent || !iv || !type) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    const messagesCollection = await getMessagesCollection();
    
    const newMessage: Message = {
      senderId: payload.userId,
      receiverId,
      encryptedContent,
      iv,
      type,
      status: 'sent',
      timestamp: new Date()
    };

    const result = await messagesCollection.insertOne(newMessage);

    return NextResponse.json({
      message: 'Message envoyé',
      messageId: result.insertedId.toString()
    });

  } catch (error) {
    console.error('Send message error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'envoi du message' },
      { status: 500 }
    );
  }
}
