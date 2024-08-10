import { io, Socket } from 'socket.io-client';
import { database } from '../database';
import { Message } from '../database/schema';
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
    });

    this.socket.on('message_sent', this.handleMessageSent.bind(this));
    this.socket.on('message_delivered', this.handleMessageDelivered.bind(this));
    this.socket.on('message_failed', this.handleMessageFailed.bind(this));
    this.socket.on('incoming_message', this.handleIncomingMessage.bind(this));
  }

  private setupEventListeners(): void {
    this.eventEmitter.on('sendMessage', this.handleSendMessage.bind(this));
  }

  private async handleMessageSent(data: { messageId: number }): Promise<void> {
    await database.updateMessageStatus(data.messageId, 'sent');
    await database.deleteSendMessageRequest(data.messageId);
    this.eventEmitter.emit('messageSent', data.messageId);
  }

  private async handleMessageDelivered(data: { messageId: number }): Promise<void> {
    await database.updateMessageStatus(data.messageId, 'delivered');
    this.eventEmitter.emit('messageDelivered', data.messageId);
  }

  private async handleMessageFailed(data: { messageId: number }): Promise<void> {
    const request = await database.getSendMessageRequest(data.messageId);
    if (request) {
      await database.updateSendMessageRequest(request.id, {
        status: 'fail',
        fail_count: request.fail_count + 1,
      });
    }
    this.eventEmitter.emit('messageFailed', data.messageId);
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    const messageId = await database.addMessage(message);
    this.eventEmitter.emit('incomingMessage', messageId);
  }

  private async handleSendMessage(message: Message): Promise<void> {
    this.socket.emit('sendMessage', message);
  }

  async sendMessage(message: Omit<Message, 'id' | 'status' | 'created_at'>): Promise<number> {
    const messageId = await database.addMessage({
      ...message,
      status: 'sending',
      created_at: Date.now(),
    });
    await this.messageScheduler.addTask(messageId);
    return messageId;
  }
}
