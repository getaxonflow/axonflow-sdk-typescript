import { BaseInterceptor } from './base';
import { AIRequest } from '../types';

/**
 * Interceptor for Google Gemini API calls
 *
 * Supports both @google/generative-ai SDK and direct API calls.
 */
export class GeminiInterceptor extends BaseInterceptor {
  canHandle(aiCall: any): boolean {
    // Check if this looks like a Gemini call
    const callString = aiCall.toString();
    return (
      callString.includes('gemini') ||
      callString.includes('generateContent') ||
      callString.includes('GenerativeModel') ||
      callString.includes('google') ||
      callString.includes('palm')
    );
  }

  extractRequest(aiCall: any): AIRequest {
    // Try to extract Gemini-specific details
    const callString = aiCall.toString();

    // Try to detect model
    let model = 'gemini-pro';
    if (callString.includes('gemini-1.5-pro')) {
      model = 'gemini-1.5-pro';
    } else if (callString.includes('gemini-1.5-flash')) {
      model = 'gemini-1.5-flash';
    } else if (callString.includes('gemini-pro-vision')) {
      model = 'gemini-pro-vision';
    }

    return {
      provider: 'gemini',
      model,
      prompt: callString,
      parameters: {
        // Would extract temperature, topP, etc. in production
      },
    };
  }

  executeWithModifications(aiCall: any, _modifications: any): Promise<any> {
    // Execute the call with any modifications from governance
    return aiCall();
  }

  getProvider(): string {
    return 'gemini';
  }
}

/**
 * Gemini content part types
 */
export interface GeminiTextPart {
  text: string;
}

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export type GeminiPart = GeminiTextPart | GeminiInlineDataPart;

export interface GeminiContent {
  role?: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

export interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
}

export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface GeminiGenerateContentResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

/**
 * Helper to wrap Gemini GenerativeModel for easier interception
 *
 * @example
 * ```typescript
 * import { GoogleGenerativeAI } from '@google/generative-ai';
 * import { AxonFlow, wrapGeminiModel } from '@axonflow/sdk';
 *
 * const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
 * const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
 * const axonflow = new AxonFlow({ apiKey: process.env.AXONFLOW_API_KEY });
 *
 * const wrappedModel = wrapGeminiModel(model, axonflow);
 *
 * // Use as normal - governance is automatic
 * const result = await wrappedModel.generateContent('What is AI governance?');
 * ```
 */
export function wrapGeminiModel(geminiModel: any, axonflow: any): any {
  return new Proxy(geminiModel, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      // Intercept generateContent and generateContentStream
      if (
        typeof original === 'function' &&
        ['generateContent', 'generateContentStream', 'sendMessage'].includes(prop.toString())
      ) {
        return async (...args: any[]) => {
          // Protect the call with AxonFlow
          return axonflow.protect(() => original.apply(target, args));
        };
      }

      // For chat sessions, wrap the returned chat object
      if (prop === 'startChat' && typeof original === 'function') {
        return (...args: any[]) => {
          const chat = original.apply(target, args);
          return wrapGeminiChat(chat, axonflow);
        };
      }

      return original;
    },
  });
}

/**
 * Helper to wrap Gemini ChatSession for multi-turn conversations
 */
function wrapGeminiChat(chatSession: any, axonflow: any): any {
  return new Proxy(chatSession, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      if (typeof original === 'function' && prop === 'sendMessage') {
        return async (...args: any[]) => {
          return axonflow.protect(() => original.apply(target, args));
        };
      }

      return original;
    },
  });
}
