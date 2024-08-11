import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, OBJECT_STORES, User, Conversation, Message, ConversationUser, DraftMessage, SendMessageRequest, AppMetadata } from './schema';

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
    indexes: { 'by-conversation': number };
  };
  send_message_requests: {
    key: number;
    value: SendMessageRequest;
    indexes: { 'by-message': number };
  };
  app_metadata: {
    key: string;
    value: AppMetadata;
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
            if (storeName === 'draft_messages') {
              // @ts-ignore
              store.createIndex('by-conversation', 'conversation_id', { unique: true });
            }
            if (storeName === 'send_message_requests') {
              // @ts-ignore
              store.createIndex('by-message', 'message_id');
            }
            if (storeName === 'app_metadata') {
              // @ts-ignore
              store.createIndex('key', 'key');
            }
          }
        }
      },
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.db!.get(OBJECT_STORES.users as 'users', id);
  }

  async upsertConversation(conversation: Partial<Conversation> & { id?: number }): Promise<number> {
    return this.transaction(async (tx) => {
      const store = tx.objectStore(OBJECT_STORES.conversations as 'conversations');
      if (conversation.id) {
        const existingConversation = await store.get(conversation.id);
        if (existingConversation) {
          Object.assign(existingConversation, conversation);
          await store.put(existingConversation);
          return existingConversation.id;
        }
      }
      const newConversation = { ...conversation, created_at: Date.now() };
      return store.add(newConversation);
    });
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

  async getConversationUsers(conversationId: number): Promise<ConversationUser[]> {
    return this.db!.getAllFromIndex(OBJECT_STORES.conversationUsers as 'conversation_users', 'by-conversation', conversationId);
  }

  async upsertDraftMessage(draftMessage: Partial<DraftMessage> & { conversation_id: number }): Promise<number> {
    return this.transaction(async (tx) => {
      const store = tx.objectStore(OBJECT_STORES.draftMessages as 'draft_messages');
      const existingDrafts = await store.index('by-conversation').getAll(draftMessage.conversation_id);

      if (existingDrafts.length > 0) {
        const existingDraft = existingDrafts[0];
        Object.assign(existingDraft, draftMessage);
        await store.put(existingDraft);
        return existingDraft.id;
      } else {
        const newDraft = { ...draftMessage, created_at: Date.now() };
        return store.add(newDraft);
      }
    });
  }

  async getDraftMessage(conversationId: number): Promise<DraftMessage | undefined> {
    return this.db!.getFromIndex(OBJECT_STORES.draftMessages as 'draft_messages', 'by-conversation', conversationId);
  }

  async deleteDraftMessage(conversationId: number): Promise<void> {
    const tx = this.db!.transaction(OBJECT_STORES.draftMessages as 'draft_messages', 'readwrite');
    const store = tx.objectStore(OBJECT_STORES.draftMessages as 'draft_messages');
    const existingDraft = await store.index('by-conversation').get(conversationId);
    if (existingDraft) {
      await store.delete(existingDraft.id);
    }
    await tx.done;
  }

  async upsertSendMessageRequest(request: Partial<SendMessageRequest> & { message_id: number }): Promise<number> {
    return this.transaction(async (tx) => {
      const store = tx.objectStore(OBJECT_STORES.sendMessageRequests as 'send_message_requests');
      const existingRequests = await store.index('by-message').getAll(request.message_id);

      if (existingRequests.length > 0) {
        const existingRequest = existingRequests[0];
        Object.assign(existingRequest, request);
        await store.put(existingRequest);
        return existingRequest.id;
      } else {
        const newRequest = {
          ...request,
          status: request.status || 'pending',
          last_sent_at: request.last_sent_at || Date.now(),
          fail_count: request.fail_count || 0,
        };
        return store.add(newRequest);
      }
    });
  }

  async getSendMessageRequest(messageId: number): Promise<SendMessageRequest | undefined> {
    return this.db!.getFromIndex(OBJECT_STORES.sendMessageRequests as 'send_message_requests', 'by-message', messageId);
  }

  async deleteSendMessageRequest(messageId: number): Promise<void> {
    const tx = this.db!.transaction(OBJECT_STORES.sendMessageRequests as 'send_message_requests', 'readwrite');
    const store = tx.objectStore(OBJECT_STORES.sendMessageRequests as 'send_message_requests');
    const existingRequest = await store.index('by-message').get(messageId);
    if (existingRequest) {
      await store.delete(existingRequest.id);
    }
    await tx.done;
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
      await tx.objectStore(OBJECT_STORES.appMetadata as 'app_metadata').put({ key: 'lastSyncTimestamp', value: timestamp });
    });
  }

  async getAppMetadata(key: string): Promise<AppMetadata | undefined> {
    return this.db!.get(OBJECT_STORES.appMetadata as 'app_metadata', key);
  }

  async setAppMetadata(key: string, value: any): Promise<void> {
    await this.db!.put(OBJECT_STORES.appMetadata as 'app_metadata', { key, value });
  }
}

export const database = new Database();