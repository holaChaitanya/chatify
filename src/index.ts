import { database } from './database';
import { DataSyncer } from './sync';
import { EventEmitter } from './events';
import { User, Conversation, Message, DraftMessage } from './database/schema';
import { debounce, throttle } from './utils';

export class ChatCore {
  private dataSyncer: DataSyncer;
  private eventEmitter: EventEmitter;

  constructor(serverUrl: string) {
    this.eventEmitter = new EventEmitter();
    this.dataSyncer = new DataSyncer(serverUrl, this.eventEmitter);
  }

  async init(): Promise<void> {
    await database.init();
    await this.dataSyncer.init();
  }

  on(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.on(event, handler);
  }

  off(event: string, handler: (...args: any[]) => void): void {
    this.eventEmitter.off(event, handler);
  }

  async sendMessage(message: Omit<Message, 'id' | 'status' | 'created_at'>): Promise<number> {
    return this.dataSyncer.sendMessage(message);
  }

  async getConversations(): Promise<Conversation[]> {
    return database.getAllConversations();
  }

  async getMessages(conversationId: number): Promise<Message[]> {
    return database.getMessagesByConversation(conversationId);
  }

  async getUser(userId: number): Promise<User | undefined> {
    return database.getUser(userId);
  }

  async saveDraftMessage(draftMessage: Omit<DraftMessage, 'id' | 'created_at'>): Promise<void> {
    await database.upsertDraftMessage(draftMessage);
  }

  async getDraftMessage(conversationId: number): Promise<DraftMessage | undefined> {
    return database.getDraftMessage(conversationId);
  }

  debouncedSaveDraftMessage = debounce(this.saveDraftMessage.bind(this), 300);

  throttledSaveDraftMessage = throttle(this.saveDraftMessage.bind(this), 1000);
}

export { User, Conversation, Message, DraftMessage };