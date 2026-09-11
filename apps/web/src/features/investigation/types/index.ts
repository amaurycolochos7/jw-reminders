export type LoadingStep = 'idle' | 'reading' | 'detecting' | 'resolving' | 'generating' | 'done';

export interface ResearchProfile {
  id: string;
  name: string;
  description?: string | null;
  themeKey: string;
  defaultOutputType?: string | null;
  defaultLevel?: string | null;
  defaultDuration?: string | null;
}

export interface Session {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  profile?: Pick<ResearchProfile, 'id' | 'name' | 'themeKey'>;
  _count?: { messages: number };
}

export interface SourceFinding {
  type: string;
  reference: string;
  title?: string;
  url?: string;
  status: string;
  notes?: string;
}

export interface CommentVariant {
  text: string;
  whyItWorks: string;
  usedSourceRefs: string[];
}

export interface GeneratedComment {
  type: string;
  durationSeconds: number;
  /** Nuevo formato: varias redacciones distintas para la misma categoría/pregunta. */
  variants?: CommentVariant[];
  // ─── Formato antiguo (mensajes ya guardados antes de la función de variantes) ───
  text?: string;
  whyItWorks?: string;
  usedSourceRefs?: string[];
  level?: string;
  mainIdea?: string;
  usedSources?: string[];
}

export interface ExtractedParagraph {
  label: string;
  paragraphNumber?: number;
  text: string;
  textPreview?: string;
  highlights?: Array<{ text: string; reason?: string }>;
}

export interface UsedSource {
  reference: string;
  type: string;
  status: string;
  sourceOrigin?: string;
  title?: string;
  publication?: string;
  url?: string;
  urlType?: 'direct' | 'search';
  extractedContent?: ExtractedParagraph[];
}

export interface AssistantResponse {
  mode?: string;
  questionType?: string;
  reasoningLevel?: string;
  sourceVerificationStatus?: string;
  parsedQuestion?: { questionCount: number; questions: string[]; subQuestions: any[] };
  summary: string;
  biblicalBasis?: Array<{ reference: string; text: string; usedSourceRef?: string }>;
  additionalReferences?: Array<{ source: string; reference: string; note: string }>;
  application?: string | null;
  sourceFindings: SourceFinding[];
  usedSources?: UsedSource[];
  detectedButUnusedSources?: Array<{ reference: string; type: string; status: string; target?: string; reason?: string; url?: string }>;
  unresolvedExplicitRefs?: Array<{ reference: string; type: string; status: string; explicit?: boolean; reason?: string; url?: string }>;
  comments: GeneratedComment[];
  warnings: string[];
  followUpSuggestions: string[];
  confidenceNote?: string | null;
  matchedStudyContext?: {
    confidence: number;
    matchStrategy: string;
    lesson: string;
    lessonKey: string;
    day: string;
    extract: string;
    articleTitle?: string;
    userQuestion?: string;
    source: string;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  structured?: AssistantResponse;
  createdAt: string;
}
