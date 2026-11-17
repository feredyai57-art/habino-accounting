import assert from 'node:assert/strict';
import {
  getOpenAIApiKey,
  getOpenAIBaseUrl,
  getOpenAIDefaultModel,
  getOpenAIProvider
} from '../src/lib/agents/openAiClient';

const variableNames = [
  'OMNIROUTE_API_KEY',
  'OMNIRUTE_API_KEY',
  'OMNIROUTE_BASE_URL',
  'OMNIRUTE_BASE_URL',
  'OMNIROUTE_MODEL',
  'OMNIRUTE_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL'
];
const previousValues = new Map(variableNames.map(name => [name, process.env[name]]));

try {
  for (const name of variableNames) delete process.env[name];
  process.env.OPENAI_API_KEY = 'openai-test-key';
  process.env.OPENAI_BASE_URL = 'https://openai.example/v1';
  process.env.OPENAI_MODEL = 'openai-test-model';

  process.env.OMNIROUTE_API_KEY = 'omniroute-test-key';
  process.env.OMNIROUTE_BASE_URL = 'https://omniroute.example/v1/';
  process.env.OMNIROUTE_MODEL = 'omniroute-test-model';
  assert.equal(getOpenAIApiKey(), 'omniroute-test-key');
  assert.equal(getOpenAIBaseUrl(), 'https://omniroute.example/v1');
  assert.equal(getOpenAIDefaultModel(), 'omniroute-test-model');
  assert.equal(getOpenAIProvider(), 'omni_route');

  delete process.env.OMNIROUTE_API_KEY;
  delete process.env.OMNIROUTE_BASE_URL;
  delete process.env.OMNIROUTE_MODEL;
  process.env.OMNIRUTE_API_KEY = 'legacy-test-key';
  process.env.OMNIRUTE_BASE_URL = 'https://legacy.example/v1';
  process.env.OMNIRUTE_MODEL = 'legacy-test-model';
  assert.equal(getOpenAIApiKey(), 'legacy-test-key');
  assert.equal(getOpenAIBaseUrl(), 'https://legacy.example/v1');
  assert.equal(getOpenAIDefaultModel(), 'legacy-test-model');
  assert.equal(getOpenAIProvider(), 'omni_route');

  console.log('OmniRoute environment configuration tests passed.');
} finally {
  for (const [name, value] of previousValues) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
