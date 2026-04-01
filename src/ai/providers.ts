import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { DavConfig } from '../config/types.js';
import { getEffectiveModel } from '../config/loader.js';

/**
 * Returns a Vercel AI SDK model instance for the configured provider.
 * This is the single place where provider/model selection happens.
 */
export function getModel(config: DavConfig) {
  const model = getEffectiveModel(config);

  switch (config.provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: config.anthropicApiKey });
      return anthropic(model);
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey: config.openaiApiKey });
      return openai(model);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: config.googleApiKey });
      return google(model);
    }
  }
}
