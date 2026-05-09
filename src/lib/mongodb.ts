import { MongoClient, Db, Collection } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'secure-messenger';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export interface User {
  _id?: string;
  username: string;
  email: string;
  password: string;
  createdAt: Date;
  lastSeen?: Date;
}

export interface Message {
  _id?: string;
  senderId: string;
  receiverId: string;
  encryptedContent: string;
  iv: string;
  type: 'text' | 'image';
  status: 'sent' | 'delivered' | 'read';
  timestamp: Date;
}

export interface Conversation {
  _id?: string;
  participants: string[];
  lastMessage?: Message;
  createdAt: Date;
  updatedAt: Date;
}

export async function getUsersCollection(): Promise<Collection<User>> {
  const { db } = await connectToDatabase();
  return db.collection<User>('users');
}

export async function getMessagesCollection(): Promise<Collection<Message>> {
  const { db } = await connectToDatabase();
  return db.collection<Message>('messages');
}

export async function getConversationsCollection(): Promise<Collection<Conversation>> {
  const { db } = await connectToDatabase();
  return db.collection<Conversation>('conversations');
}
