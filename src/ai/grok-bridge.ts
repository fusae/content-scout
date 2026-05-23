import axios from 'axios';
import { logger } from '../utils/logger.js';

interface GrokBridgeResponse {
  reply?: string;
  conversationId?: string | null;
}

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export class GrokBridgeClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token?: string,
    private readonly timeoutMs: number = 60000
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    logger.info(`GrokBridgeClient initialized: ${this.baseUrl}`);
  }

  async chat(prompt: string, options?: ChatOptions): Promise<string> {
    const message = options?.systemPrompt
      ? `${options.systemPrompt}\n\n${prompt}`
      : prompt;

    const response = await axios.post<GrokBridgeResponse>(
      `${this.baseUrl}/grok/chat`,
      { message },
      {
        timeout: this.timeoutMs,
        headers: this.buildHeaders(),
      }
    );

    const reply = response.data.reply?.trim();
    if (!reply) {
      throw new Error('Grok bridge returned empty reply');
    }

    return reply;
  }

  private buildHeaders(): Record<string, string> {
    if (!this.token) {
      return {};
    }

    return {
      Authorization: `Bearer ${this.token}`,
    };
  }
}
