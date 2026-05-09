import { NextRequest, NextResponse } from 'next/server';
import { getUsersCollection } from '@/lib/mongodb';
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
    const search = searchParams.get('search');

    const usersCollection = await getUsersCollection();
    
    let users;
    if (search) {
      users = await usersCollection
        .find({
          $and: [
            { _id: { $ne: payload.userId } },
            {
              $or: [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
              ]
            }
          ]
        })
        .project({ password: 0 }) // Ne pas renvoyer le mot de passe
        .limit(20)
        .toArray();
    } else {
      users = await usersCollection
        .find({ _id: { $ne: payload.userId } })
        .project({ password: 0 })
        .limit(50)
        .toArray();
    }

    return NextResponse.json({ users });

  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des utilisateurs' },
      { status: 500 }
    );
  }
}
