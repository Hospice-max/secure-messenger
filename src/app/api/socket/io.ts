import { NextApiRequest, NextApiResponse } from 'next';
import { initializeSocket } from '@/lib/socket-init';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const io = initializeSocket(req, res);
    res.status(200).json({ message: 'Socket.IO initialized' });
  } catch (error) {
    console.error('Socket.IO initialization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
