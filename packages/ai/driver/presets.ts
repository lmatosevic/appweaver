import { AiCapability } from '../types';

/** The defaults an endpoint of the `ai.endpoints` config takes from its preset. */
export type AiPreset = {
  /** The driver talking to the endpoint */
  driver: string;
  /** The base URL of the API */
  baseUrl?: string;
  /** The environment variable the API key is read from when the endpoint sets none */
  apiKeyVariable?: string;
  /** Whether the endpoint rejects a request without an API key, checked when its driver is created */
  apiKeyRequired?: boolean;
  /** The capabilities of its models, all of them when missing */
  capabilities?: AiCapability[];
  /** Options of the driver, i.e. the parameter of the maximum tokens */
  options?: Record<string, unknown>;
};

/** Every capability, the default of an endpoint without a preset limiting them. */
export const ALL_CAPABILITIES: AiCapability[] = [
  'tools',
  'json',
  'json-schema',
  'images',
  'files',
  'reasoning',
  'embeddings'
];

/** The capabilities of the local servers, which read no files. */
const LOCAL_CAPABILITIES: AiCapability[] = [
  'tools',
  'json',
  'json-schema',
  'images',
  'reasoning',
  'embeddings'
];

/**
 * The presets of the endpoints, by name. Every OpenAI-compatible server is reached by the `openai` driver of
 * `@appweaver/openai`, an unknown server by setting its `baseUrl` without a preset.
 */
export const aiPresets: Readonly<Record<string, AiPreset>> = Object.freeze({
  openai: {
    driver: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyVariable: 'OPENAI_API_KEY',
    apiKeyRequired: true,
    options: { maxTokensParam: 'max_completion_tokens' }
  },
  openrouter: {
    driver: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyVariable: 'OPENROUTER_API_KEY',
    apiKeyRequired: true,
    options: { reasoningParam: 'reasoning' }
  },
  ollama: {
    driver: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyVariable: 'OLLAMA_API_KEY',
    capabilities: LOCAL_CAPABILITIES
  },
  lmstudio: {
    driver: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    capabilities: LOCAL_CAPABILITIES
  },
  vllm: {
    driver: 'openai',
    baseUrl: 'http://localhost:8000/v1',
    apiKeyVariable: 'VLLM_API_KEY',
    capabilities: LOCAL_CAPABILITIES
  },
  llamacpp: {
    driver: 'openai',
    baseUrl: 'http://localhost:8080/v1',
    capabilities: LOCAL_CAPABILITIES
  },
  litellm: {
    driver: 'openai',
    baseUrl: 'http://localhost:4000/v1',
    apiKeyVariable: 'LITELLM_API_KEY'
  },
  groq: {
    driver: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyVariable: 'GROQ_API_KEY',
    apiKeyRequired: true,
    capabilities: ['tools', 'json', 'json-schema', 'images', 'reasoning']
  },
  together: {
    driver: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    apiKeyVariable: 'TOGETHER_API_KEY',
    apiKeyRequired: true,
    capabilities: LOCAL_CAPABILITIES
  },
  fireworks: {
    driver: 'openai',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKeyVariable: 'FIREWORKS_API_KEY',
    apiKeyRequired: true,
    capabilities: LOCAL_CAPABILITIES
  },
  deepseek: {
    driver: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyVariable: 'DEEPSEEK_API_KEY',
    apiKeyRequired: true,
    capabilities: ['tools', 'json', 'reasoning']
  },
  mistral: {
    driver: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyVariable: 'MISTRAL_API_KEY',
    apiKeyRequired: true,
    capabilities: LOCAL_CAPABILITIES
  },
  xai: {
    driver: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    apiKeyVariable: 'XAI_API_KEY',
    apiKeyRequired: true,
    capabilities: ['tools', 'json', 'json-schema', 'images', 'reasoning']
  },
  gemini: {
    driver: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyVariable: 'GEMINI_API_KEY',
    apiKeyRequired: true,
    capabilities: LOCAL_CAPABILITIES
  },
  huggingface: {
    driver: 'openai',
    baseUrl: 'https://router.huggingface.co/v1',
    apiKeyVariable: 'HF_TOKEN',
    apiKeyRequired: true,
    capabilities: ['tools', 'json', 'json-schema', 'images', 'reasoning']
  },
  mock: { driver: 'mock' }
});
