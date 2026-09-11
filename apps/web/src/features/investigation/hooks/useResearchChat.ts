'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../services/api';
import { delay } from '../utils/helpers';
import type { Session, ChatMessage, LoadingStep, ResearchProfile } from '../types/index';

export function useResearchChat() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [profiles, setProfiles] = useState<ResearchProfile[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<ResearchProfile | Session['profile'] | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [outputType, setOutputType] = useState('comments');
  const [level, setLevel] = useState('auto');
  const [duration, setDuration] = useState('auto');
  const [variantLoadingKey, setVariantLoadingKey] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSessions();
    loadProfiles();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadSessions() {
    const data = await api.fetchSessions();
    setSessions(data);
  }

  async function loadProfiles() {
    const data = await api.fetchProfiles();
    setProfiles(data);
  }

  async function loadSession(id: string) {
    const data = await api.fetchSession(id);
    if (data) {
      setCurrentSessionId(id);
      setMessages(data.session.messages || []);
      setCurrentProfile((data.session as any).profile || null);
      setSidebarOpen(false);
    }
  }

  async function startNewChat(profileId: string) {
    const session = await api.createSession(profileId);
    if (!session) {
      setError('No se pudo crear el chat. Intenta de nuevo.');
      return;
    }
    setCurrentSessionId(session.id);
    setCurrentProfile(session.profile || profiles.find((p) => p.id === profileId) || null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
    loadSessions();

    const profile = profiles.find((p) => p.id === profileId);
    if (profile) {
      if (profile.defaultOutputType) setOutputType(profile.defaultOutputType);
      if (profile.defaultLevel) setLevel(profile.defaultLevel);
      if (profile.defaultDuration) setDuration(profile.defaultDuration);
    }
  }

  async function deleteSessionData(id: string) {
    const success = await api.deleteSession(id);
    if (success) {
      setSessions((s) => s.filter((x) => x.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setCurrentProfile(null);
        setMessages([]);
        setError(null);
      }
    }
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || loadingStep !== 'idle') return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUserMsg]);

    setLoadingStep('reading');
    await delay(400);
    setLoadingStep('detecting');
    await delay(500);
    setLoadingStep('resolving');

    try {
      const response = await api.sendMessage({
        sessionId: currentSessionId || undefined,
        profileId: currentSessionId ? undefined : currentProfile?.id,
        message: userMessage,
        options: { outputType, level, duration, language: 'es' },
      });

      setLoadingStep('generating');

      if (!response) {
        setError('Error al procesar el mensaje');
        setLoadingStep('idle');
        return;
      }

      if (!currentSessionId && response.sessionId) {
        setCurrentSessionId(response.sessionId);
        loadSessions();
      }

      const assistantMsg: ChatMessage = {
        id: response.messageId,
        role: 'assistant',
        content: response.assistantMessage?.summary || '',
        structured: response.assistantMessage,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m.filter((msg) => msg.id !== tempUserMsg.id), { ...tempUserMsg }, assistantMsg]);
      setLoadingStep('done');
      setTimeout(() => setLoadingStep('idle'), 800);
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.');
      setLoadingStep('idle');
    }
  }

  async function handleQuickAction(instruction: string) {
    if (!currentSessionId || loadingStep !== 'idle') return;
    setLoadingStep('generating');
    try {
      const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
      const response = await api.regenerateComment({
        sessionId: currentSessionId,
        messageId: lastAssistantMsg?.id || '',
        instruction,
      });

      if (!response) {
        setError('Error al regenerar');
        setLoadingStep('idle');
        return;
      }

      const userMsg: ChatMessage = {
        id: `action-${Date.now()}`,
        role: 'user',
        content: instruction,
        createdAt: new Date().toISOString(),
      };
      const assistantMsg: ChatMessage = {
        id: response.messageId,
        role: 'assistant',
        content: response.assistantMessage?.summary || '',
        structured: response.assistantMessage,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, userMsg, assistantMsg]);
      setLoadingStep('idle');
    } catch {
      setError('Error al regenerar');
      setLoadingStep('idle');
    }
  }

  async function handleGenerateMoreVariants(messageId: string, commentType: string) {
    if (!currentSessionId || variantLoadingKey) return;
    const key = `${messageId}:${commentType}`;
    setVariantLoadingKey(key);
    try {
      const result = await api.generateMoreVariants({ sessionId: currentSessionId, messageId, commentType });
      if (!result) {
        setError('No se pudieron generar más variantes. Intenta de nuevo.');
        return;
      }
      setMessages((m) => m.map((msg) => {
        if (msg.id !== messageId || !msg.structured) return msg;
        const comments = (msg.structured.comments || []).map((c) =>
          (c.type || c.level) === commentType ? { ...c, variants: result.variants } : c
        );
        return { ...msg, structured: { ...msg.structured, comments } };
      }));
    } catch {
      setError('No se pudieron generar más variantes. Intenta de nuevo.');
    } finally {
      setVariantLoadingKey(null);
    }
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [input, loadingStep, currentSessionId, outputType, level, duration]);

  return {
    sessions,
    profiles,
    currentProfile,
    currentSessionId,
    messages,
    input,
    loadingStep,
    error,
    sidebarOpen,
    sidebarCollapsed,
    searchOpen,
    searchQuery,
    optionsOpen,
    outputType,
    level,
    duration,
    messagesEndRef,
    textareaRef,
    searchInputRef,
    setInput,
    setSidebarOpen,
    setSidebarCollapsed,
    setSearchOpen,
    setSearchQuery,
    setOptionsOpen,
    setOutputType,
    setLevel,
    setDuration,
    setError,
    loadSession,
    startNewChat,
    deleteSessionData,
    sendMessage,
    handleQuickAction,
    handleKeyDown,
    variantLoadingKey,
    handleGenerateMoreVariants,
  };
}
