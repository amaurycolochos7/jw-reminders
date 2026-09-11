import { api } from '@/lib/api';
import type { Session, ChatMessage, AssistantResponse, ResearchProfile, CommentVariant } from '../types/index';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchSessions(): Promise<Session[]> {
  try {
    const res = await api(`${API_BASE}/api/research-chat/sessions`);
    if (res.ok) {
      const data = await res.json();
      return data.sessions || [];
    }
    return [];
  } catch {
    return [];
  }
}

export async function fetchProfiles(): Promise<ResearchProfile[]> {
  try {
    const res = await api(`${API_BASE}/api/research-chat/profiles`);
    if (res.ok) {
      const data = await res.json();
      return data.profiles || [];
    }
    return [];
  } catch {
    return [];
  }
}

export async function createSession(profileId: string, title?: string): Promise<Session | null> {
  try {
    const res = await api(`${API_BASE}/api/research-chat/sessions`, {
      method: 'POST',
      body: JSON.stringify({ profileId, title }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.session || null;
  } catch {
    return null;
  }
}

export async function fetchSession(id: string): Promise<{ session: { messages: ChatMessage[] } } | null> {
  try {
    const res = await api(`${API_BASE}/api/research-chat/sessions/${id}`);
    if (res.ok) {
      return await res.json();
    }
    return null;
  } catch {
    return null;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    await api(`${API_BASE}/api/research-chat/sessions/${id}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

export interface SendMessagePayload {
  sessionId?: string;
  profileId?: string;
  message: string;
  options: {
    outputType: string;
    level: string;
    duration: string;
    language: string;
  };
}

export interface SendMessageResponse {
  sessionId: string;
  messageId: string;
  assistantMessage: AssistantResponse;
}

export async function sendMessage(payload: SendMessagePayload): Promise<SendMessageResponse | null> {
  try {
    const res = await api(`${API_BASE}/api/research-chat/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return null;
    }

    return await res.json();
  } catch {
    return null;
  }
}

export interface RegeneratePayload {
  sessionId: string;
  messageId: string;
  instruction: string;
}

export async function regenerateComment(payload: RegeneratePayload): Promise<SendMessageResponse | null> {
  try {
    const res = await api(`${API_BASE}/api/research-chat/regenerate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return null;
    }

    return await res.json();
  } catch {
    return null;
  }
}

export interface GenerateMoreVariantsPayload {
  sessionId: string;
  messageId: string;
  commentType: string;
  count?: number;
}

export interface GenerateMoreVariantsResponse {
  messageId: string;
  commentType: string;
  variants: CommentVariant[];
}

export async function generateMoreVariants(payload: GenerateMoreVariantsPayload): Promise<GenerateMoreVariantsResponse | null> {
  try {
    const res = await api(`${API_BASE}/api/research-chat/messages/variants`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function resolveSource(reference: string): Promise<{ extractedContent: any[] } | null> {
  try {
    const res = await api(`${API_BASE}/api/research-chat/sources/resolve?reference=${encodeURIComponent(reference)}`);

    if (!res.ok) {
      return null;
    }

    return await res.json();
  } catch {
    return null;
  }
}
