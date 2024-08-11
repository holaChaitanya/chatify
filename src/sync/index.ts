import { io, Socket } from 'socket.io-client';
import { database } from '../database';
import { Message, Conversation, User } from '../database/schema';
import { EventEmitter } from '../events';
import { MessageScheduler } from './messageScheduler';

export class DataSyncer {
  private socket: Socket;
  private eventEmitter: EventEmitter;
  private messageScheduler: MessageScheduler;

  constructor(serverUrl: string, eventEmitter: EventEmitter) {
    this.socket = io(serverUrl);
    this.eventEmitter = eventEmitter;
    this.messageScheduler = new MessageScheduler(eventEmitter);
  }

  async init(): Promise<void> {
    await this.messageScheduler.init();
    this.setupSocketListeners();
    this.setupEventListeners();
  }

  private setupSocketListeners(): void {
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.requestSync();
    });

    this.socket.on('message_sent', this.handleMessageSent.bind(this));
    this.socket.on('message_delivered', this.handleMessageDelivered.bind(this));
    this.socket.on('message_failed', this.handleMessageFailed.bind(this));
    this.socket.on('incoming_message', this.handleIncomingMessage.bind(this));
    this.socket.on('sync', this.handleSync.bind(this));
    this.socket.on('sync_response', this.handleSyncResponse.bind(this));
  }

  private setupEventListeners(): void {
    this.eventEmitter.on('sendMessage', this.handleSendMessage.bind(this));
  }

  private async requestSync(): Promise<void> {
    const lastSyncTimestamp = await this.getLastSyncTimestamp();
    this.socket.emit('request_sync', { lastSyncTimestamp });
  }

  private async getLastSyncTimestamp(): Promise<number> {
    try {
      const metadata = await database.getAppMetadata('lastSyncTimestamp');
      return metadata ? metadata.value : 0;
    } catch (error) {
      console.error('Error getting last sync timestamp:', error);
      return 0;
    }
  }

  private async handleMessageSent(data: { messageId: number }): Promise<void> {
    await database.upsertMessage({ id: data.messageId, status: 'sent' });
    await database.deleteSendMessageRequest(data.messageId);
    this.eventEmitter.emit('messageSent', data.messageId);
  }

  private async handleMessageDelivered(data: { messageId: number }): Promise<void> {
    await database.upsertMessage({ id: data.messageId, status: 'delivered' });
    this.eventEmitter.emit('messageDelivered', data.messageId);
  }

  private async handleMessageFailed(data: { messageId: number }): Promise<void> {
    const request = await database.getSendMessageRequest(data.messageId);
    if (request) {
      await database.upsertSendMessageRequest({
        ...request,
        status: 'fail',
        fail_count: (request.fail_count || 0) + 1,
      });
    }
    this.eventEmitter.emit('messageFailed', data.messageId);
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    const messageId = await database.upsertMessage(message);
    this.eventEmitter.emit('incomingMessage', messageId);
  }

  private async handleSync(data: { messages: Message[], conversations: Conversation[], users: User[] }): Promise<void> {
    console.log('Sync data received:', data);

    try {
      await database.transaction(async (tx) => {
        // Update messages
        for (const message of data.messages) {
          const existingMessage = await tx.getMessage(message.id);
          if (existingMessage) {
            await tx.updateMessage(message.id, message);
          } else {
            await tx.addMessage(message);
          }
        }

        // Update conversations
        for (const conversation of data.conversations) {
          const existingConversation = await tx.getConversation(conversation.id);
          if (existingConversation) {
            await tx.updateConversation(conversation.id, conversation);
          } else {
            await tx.addConversation(conversation);
          }
        }

        // Update users
        for (const user of data.users) {
          const existingUser = await tx.getUser(user.id);
          if (existingUser) {
            await tx.updateUser(user.id, user);
          } else {
            await tx.addUser(user);
          }
        }

        // Update the last sync timestamp
        await database.setAppMetadata('lastSyncTimestamp', Date.now());
      });

      console.log('Sync completed successfully');
      this.eventEmitter.emit('syncCompleted');
    } catch (error) {
      console.error('Error during sync:', error);
      this.eventEmitter.emit('syncFailed', error);
    }
  }

  private async handleSyncResponse(data: { messages: Message[], conversations: Conversation[], users: User[] }): Promise<void> {
    await this.handleSync(data);
  }

  private async handleSendMessage(message: Message): Promise<void> {
    this.socket.emit('sendMessage', message);
  }

  async sendMessage(message: Omit<Message, 'id' | 'status' | 'created_at'>): Promise<number> {
    const messageId = await database.upsertMessage({
      ...message,
      status: 'sending',
      created_at: Date.now(),
    });
    await this.messageScheduler.addTask(messageId);
    return messageId;
  }
}