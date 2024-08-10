export interface User {
  id: number;
  name: string;
  profile_photo_url: string;
}

export interface Conversation {
  id: number;
  name: string;
}

export interface Message {
  id: number;
  content: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  created_at: number;
  sender_id: number;
  conversation_id: number;
}

export interface ConversationUser {
  conversation_id: number;
  user_id: number;
}

export interface DraftMessage {
  id: number;
  content: string;
  conversation_id: number;
}

export interface SendMessageRequest {
  id: number;
  message_id: number;
  status: 'pending' | 'in_flight' | 'fail' | 'success';
  last_sent_at: number;
  fail_count: number;
}
