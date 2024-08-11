import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, OBJECT_STORES, User, Conversation, Message, ConversationUser, DraftMessage, SendMessageRequest } from './schema';

interface ChatDBSchema extends DBSchema {
  users: {
    key: number;
    value: User;
  };
  conversations: {
    key: number;
    value: Conversation;
  };
  messages: {
    key: number;
    value: Message;
    indexes: { 'by-conversation': number };
  };
  conversation_users: {
    key: [number, number];
    value: ConversationUser;
    indexes: { 'by-conversation': number; 'by-user': number };
  };
  draft_messages: {
    key: number;
    value: DraftMessage;
  };
  send_message_requests: {
    key: number;
    value: SendMessageRequest;
  };
}

export class Database {
  private db: IDBPDatabase<ChatDBSchema> | null = null;

  async init(): Promise<void> {
    this.db = await openDB<ChatDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const storeName of Object.values(OBJECT_STORES) as Array<keyof ChatDBSchema>) {
          // @ts-ignore
          if (!db.objectStoreNames.contains(storeName)) {
            // @ts-ignore
            const store = db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
            if (storeName === 'messages') {
              // @ts-ignore
              store.createIndex('by-conversation', 'conversation_id');
            }
            if (storeName === 'conversation_users') {
              // @ts-ignore
              store.createIndex('by-conversation', 'conversation_id');
              // @ts-ignore
              store.createIndex('by-user', 'user_id');
            }
          }
        }
      },
    });
  }

  async addUser(user: Omit<User, 'id'>): Promise<number> {
    return this.db!.add(OBJECT_STORES.users as 'users', user as User);
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.db!.get(OBJECT_STORES.users as 'users', id);
  }

  async addConversation(conversation: Omit<Conversation, 'id'>): Promise<number> {
    return this.db!.add(OBJECT_STORES.conversations as 'conversations', conversation as Conversation);
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    return this.db!.get(OBJECT_STORES.conversations as 'conversations', id);
  }

  async getAllConversations(): Promise<Conversation[]> {
    return this.db!.getAll(OBJECT_STORES.conversations as 'conversations');
  }

  async upsertMessage(message: Partial<Message> & { id?: number }): Promise<number> {
    return this.transaction(async (tx) => {
      const store = tx.objectStore(OBJECT_STORES.messages as 'messages');
      if (message.id) {
        const existingMessage = await store.get(message.id);
        if (existingMessage) {
          Object.assign(existingMessage, message);
          await store.put(existingMessage);
          return existingMessage.id;
        }
      }
      const newMessage = { ...message, created_at: message.created_at || Date.now() };
      return store.add(newMessage);
    });
  }

  async getMessage(id: number): Promise<Message | undefined> {
    return this.db!.get(OBJECT_STORES.messages as 'messages', id);
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return this.db!.getAllFromIndex(OBJECT_STORES.messages as 'messages', 'by-conversation', conversationId);
  }

  async addConversationUser(conversationUser: ConversationUser): Promise<void> {
    await this.db!.add(OBJECT_STORES.conversationUsers as 'conversation_users', conversationUser);
  }

  async getConversationUsers(conversationId: number): Promise<ConversationUser[]> {
    return this.db!.getAllFromIndex(OBJECT_STORES.conversationUsers as 'conversation_users', 'by-conversation', conversationId);
  }

  async addDraftMessage(draftMessage: Omit<DraftMessage, 'id'>): Promise<number> {
    return this.db!.add(OBJECT_STORES.draftMessages as 'draft_messages', draftMessage as DraftMessage);
  }

  async getDraftMessage(conversationId: number): Promise<DraftMessage | undefined> {
    const draftMessages = await this.db!.getAll(OBJECT_STORES.draftMessages as 'draft_messages');
    return draftMessages.find(dm => dm.conversation_id === conversationId);
  }

  async updateDraftMessage(id: number, content: string): Promise<void> {
    const tx = this.db!.transaction(OBJECT_STORES.draftMessages as 'draft_messages', 'readwrite');
    const store = tx.objectStore(OBJECT_STORES.draftMessages as 'draft_messages');
    const draftMessage = await store.get(id);
    if (draftMessage) {
      draftMessage.content = content;
      await store.put(draftMessage);
    }
    await tx.done;
  }

  async deleteDraftMessage(id: number): Promise<void> {
    await this.db!.delete(OBJECT_STORES.draftMessages as 'draft_messages', id);
  }

  async addSendMessageRequest(request: Omit<SendMessageRequest, 'id'>): Promise<number> {
    return this.db!.add(OBJECT_STORES.sendMessageRequests as 'send_message_requests', request as SendMessageRequest);
  }

  async getSendMessageRequest(id: number): Promise<SendMessageRequest | undefined> {
    return this.db!.get(OBJECT_STORES.sendMessageRequests as 'send_message_requests', id);
  }

  async updateSendMessageRequest(id: number, updates: Partial<SendMessageRequest>): Promise<void> {
    const tx = this.db!.transaction(OBJECT_STORES.sendMessageRequests as 'send_message_requests', 'readwrite');
    const store = tx.objectStore(OBJECT_STORES.sendMessageRequests as 'send_message_requests');
    const request = await store.get(id);
    if (request) {
      Object.assign(request, updates);
      await store.put(request);
    }
    await tx.done;
  }

  async deleteSendMessageRequest(id: number): Promise<void> {
    await this.db!.delete(OBJECT_STORES.sendMessageRequests as 'send_message_requests', id);
  }

  async getAllSendMessageRequests(): Promise<SendMessageRequest[]> {
    return this.db!.getAll(OBJECT_STORES.sendMessageRequests as 'send_message_requests');
  }

  async transaction<T>(
    callback: (tx: any) => Promise<T>
  ): Promise<T> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const tx = this.db.transaction(Object.values(OBJECT_STORES) as any, 'readwrite');
    try {
      const result = await callback(tx);
      await tx.done;
      return result;
    } catch (error) {
      tx.abort();
      throw error;
    }
  }

  async updateConversation(id: number, updates: Partial<Conversation>): Promise<void> {
    return this.transaction(async (tx) => {
      const store = tx.objectStore(OBJECT_STORES.conversations as 'conversations');
      const conversation = await store.get(id);
      if (conversation) {
        Object.assign(conversation, updates);
        await store.put(conversation);
      }
    });
  }

  async updateUser(id: number, updates: Partial<User>): Promise<void> {
    return this.transaction(async (tx) => {
      const store = tx.objectStore(OBJECT_STORES.users as 'users');
      const user = await store.get(id);
      if (user) {
        Object.assign(user, updates);
        await store.put(user);
      }
    });
  }

  async setLastSyncTimestamp(timestamp: number): Promise<void> {
    return this.transaction(async (tx) => {
      await tx.objectStore('app_metadata').put({ key: 'lastSyncTimestamp', value: timestamp });
    });
  }
}

export const database = new Database();