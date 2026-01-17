import { GoogleGenAI, type ContentListUnion, type Part } from '@google/genai';

// Initialize the Gemini client
// The API key should be set via environment variable GEMINI_API_KEY
const getClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY environment variable is not set');
  }
  return new GoogleGenAI({ apiKey });
};

// Content type for our use
interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

// YouTube URL detection regex
const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S*)?/gi;

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  youtubeUrl?: string;
}

/**
 * Extracts YouTube URLs from a message
 */
export function extractYoutubeUrls(text: string): string[] {
  const matches = text.match(YOUTUBE_URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Normalizes YouTube URL to standard format
 */
export function normalizeYoutubeUrl(url: string): string {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (match && match[1]) {
    return `https://www.youtube.com/watch?v=${match[1]}`;
  }
  return url;
}

/**
 * Checks if a string contains a YouTube URL
 */
export function containsYoutubeUrl(text: string): boolean {
  // Use a fresh regex to avoid stateful lastIndex issues with global flag
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  return regex.test(text);
}

/**
 * Generates content using Gemini with optional YouTube video context
 */
export async function generateWithVideo(
  message: string,
  youtubeUrls: string[] = [],
  conversationHistory: ChatMessage[] = []
): Promise<string> {
  const ai = getClient();

  // Build the contents array with conversation history
  const contents: Content[] = [];

  // Add conversation history
  for (const msg of conversationHistory) {
    const parts: Part[] = [];

    // If this message had a YouTube URL, include it
    if (msg.youtubeUrl) {
      parts.push({
        fileData: {
          fileUri: normalizeYoutubeUrl(msg.youtubeUrl),
        },
      });
    }

    parts.push({ text: msg.content });

    contents.push({
      role: msg.role,
      parts,
    });
  }

  // Build the current message parts
  const currentParts: Part[] = [];

  // Add YouTube videos first (as per best practices, video before text)
  for (const url of youtubeUrls) {
    currentParts.push({
      fileData: {
        fileUri: normalizeYoutubeUrl(url),
      },
    });
  }

  // Add the text message
  currentParts.push({ text: message });

  contents.push({
    role: 'user',
    parts: currentParts,
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents,
      config: {
        systemInstruction: `You are a helpful teaching assistant for an interactive whiteboard application. 
You help users understand educational content, answer questions, and provide explanations.
When analyzing YouTube videos, provide detailed insights about the content, key points, and answer questions about what you observe.
Be concise but thorough in your responses.
Format your responses in a clear, readable way using markdown when helpful.`,
      },
    });

    return response.text || 'I was unable to generate a response.';
  } catch (error) {
    console.error('Gemini API error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new Error('Invalid or missing API key. Please check your VITE_GEMINI_API_KEY.');
      }
      if (error.message.includes('quota')) {
        throw new Error('API quota exceeded. Please try again later.');
      }
      if (error.message.includes('video') || error.message.includes('YouTube')) {
        throw new Error('Unable to process this YouTube video. The video may be private, unlisted, or unavailable.');
      }
      throw new Error(`Failed to generate response: ${error.message}`);
    }
    
    throw new Error('An unexpected error occurred while generating a response.');
  }
}

/**
 * Simple text-only generation (no video)
 */
export async function generateText(
  message: string,
  conversationHistory: ChatMessage[] = []
): Promise<string> {
  return generateWithVideo(message, [], conversationHistory);
}
