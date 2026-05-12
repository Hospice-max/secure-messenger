import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      error: 'La messagerie en temps réel est gérée par un serveur Socket.IO externe. Lancez le serveur de sockets avec "npm run socket-server" puis connectez-vous depuis l\'application.'
    },
    { status: 400 }
  );
}
