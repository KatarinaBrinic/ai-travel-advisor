export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: MessageDto[];
}

export interface SendMessageResponse {
  userMessage: MessageDto;
  assistantMessage: MessageDto;
}

export interface SystemPromptDto {
  content: string;
}

export interface TripPlanDayDto {
  date: string;
  title?: string;
  activities: string[];
}

export interface TripPlanDto {
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  days: TripPlanDayDto[];
  notes: string | null;
  updatedAt: string | null;
}
