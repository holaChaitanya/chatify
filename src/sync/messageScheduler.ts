import { database } from '../database';
import { SendMessageRequest } from '../database/schema';
import { EventEmitter } from '../events';

export class MessageScheduler {
  private taskQueue: SendMessageRequest[] = [];
  private isProcessing = false;
  private eventEmitter: EventEmitter;

  constructor(eventEmitter: EventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  async init(): Promise<void> {
    await this.loadPendingRequests();
    this.startProcessing();
  }

  private async loadPendingRequests(): Promise<void> {
    const requests = await database.getAllSendMessageRequests();
    this.taskQueue = requests.filter(r => r.status === 'pending' || r.status === 'fail');
  }

  private startProcessing(): void {
    if (!this.isProcessing) {
      this.isProcessing = true;
      this.processNextTask();
    }
  }

  private async processNextTask(): Promise<void> {
    if (this.taskQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    const task = this.taskQueue.shift()!;

    switch (task.status) {
      case 'pending':
        await this.sendMessage(task);
        break;
      case 'fail':
        await this.retryMessage(task);
        break;
    }

    this.processNextTask();
  }

  private async sendMessage(task: SendMessageRequest): Promise<void> {
    try {
      await database.updateSendMessageRequest(task.id, { status: 'in_flight', last_sent_at: Date.now() });
      const message = await database.getMessage(task.message_id);
      if (message) {
        this.eventEmitter.emit('sendMessage', message);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      await database.updateSendMessageRequest(task.id, { status: 'fail', fail_count: (task.fail_count || 0) + 1 });
      this.taskQueue.push(task);
    }
  }

  private async retryMessage(task: SendMessageRequest): Promise<void> {
    const retryDelay = Math.pow(2, task.fail_count) * 1000;
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    await this.sendMessage(task);
  }

  async addTask(messageId: number): Promise<void> {
    const request: Omit<SendMessageRequest, 'id'> = {
      message_id: messageId,
      status: 'pending',
      last_sent_at: Date.now(),
      fail_count: 0,
    };
    const requestId = await database.addSendMessageRequest(request);
    const newRequest = await database.getSendMessageRequest(requestId);
    if (newRequest) {
      this.taskQueue.push(newRequest);
      this.startProcessing();
    }
  }
}