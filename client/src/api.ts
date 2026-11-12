import type {
  ConversationDetail,
  ConversationSummary,
  SendMessageResponse,
  SystemPromptDto,
  TripPlanDto,
} from '../../shared/types.ts';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function listConversations(): Promise<ConversationSummary[]> {
  return request('/api/conversations');
}

export function createConversation(title?: string): Promise<ConversationSummary> {
  return request('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  });
}

export function getConversation(id: string): Promise<ConversationDetail> {
  return request(`/api/conversations/${id}`);
}

export function deleteConversation(id: string): Promise<void> {
  return request(`/api/conversations/${id}`, { method: 'DELETE' });
}

export function sendMessage(id: string, content: string): Promise<SendMessageResponse> {
  return request(`/api/conversations/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function getSystemPrompt(): Promise<SystemPromptDto> {
  return request('/api/system-prompt');
}

export function updateSystemPrompt(content: string): Promise<SystemPromptDto> {
  return request('/api/system-prompt', {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export function getTripPlan(): Promise<TripPlanDto> {
  return request('/api/trip-plan');
}

export function updateTripPlan(patch: Record<string, unknown>): Promise<TripPlanDto> {
  return request('/api/trip-plan', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
