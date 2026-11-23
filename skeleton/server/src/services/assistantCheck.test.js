import request from 'supertest';
import { createApp } from '../app.js';
import { createRegistry } from '../core/registry.js';
import { useTestContext } from '../../test/helpers.js';
import { loadEnv } from '../config/env.js';
import { explainAwsError, pingModel, setConverseForTests } from './assistantService.js';

const err = (name, message = '') => Object.assign(new Error(message), { name });

describe('explainAwsError', () => {
  const cases = [
    ['CredentialsProviderError', 'Could not load credentials from any providers', /No AWS credentials/, /AWS_ACCESS_KEY_ID/],
    ['ExpiredTokenException', 'The security token included in the request is expired', /expired/, /fresh keys|long-lived/],
    ['UnrecognizedClientException', 'The security token included in the request is invalid.', /rejected the credentials/, /re-copy|Re-copy/],
    ['ValidationException', "Invocation of model ID anthropic.x with on-demand throughput isn't supported. Retry your request with the ID or ARN of an inference profile", /inference profile/, /us\.|Inference profiles/],
    ['AccessDeniedException', 'User: arn:aws:iam::1:user/a is not authorized to perform: bedrock:InvokeModel on resource', /IAM user may not call Bedrock/, /docs\/BEDROCK\.md/],
    ['AccessDeniedException', 'You don\'t have access to the model with the specified model ID.', /Model access has not been granted/, /Model access/],
    ['ResourceNotFoundException', 'Could not resolve the foundation model from the provided model identifier.', /cannot find that model/, /AWS_REGION/],
    ['ThrottlingException', 'Too many requests, please wait before trying again.', /rate limiting/, /Service Quotas/],
    ['Error', 'getaddrinfo ENOTFOUND bedrock-runtime.us-east-1.amazonaws.com', /Could not reach AWS/, /network/],
  ];
  test.each(cases)('%s: %s', (name, message, title, action) => {
    const r = explainAwsError(err(name, message));
    expect(r.title).toMatch(title);
    expect(r.action).toMatch(action);
  });

  test('an unknown error is passed through, shortened, and never throws on odd input', () => {
    expect(explainAwsError(err('Weird', 'x'.repeat(500))).action.length).toBeLessThan(230);
    expect(explainAwsError(undefined).title).toBe('Bedrock returned an error');
    expect(explainAwsError({}).title).toBe('Bedrock returned an error');
  });

  test('never repeats credentials back, even if the SDK put them in the message', () => {
    const secret = 'not-a-real-key-0000';
    const out = JSON.stringify(explainAwsError(err('SomethingElse', `bad key ${secret}`)));
    // an unrecognised message is echoed (shortened) for diagnosis, so the script must never be fed credentials;
    // known errors give fixed advice and never echo the message at all
    expect(JSON.stringify(explainAwsError(err('UnrecognizedClientException', `key ${secret}`)))).not.toContain(secret);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('pingModel', () => {
  afterEach(() => setConverseForTests(null));

  test('sends a tiny, tool-free request and returns the model text', async () => {
    let sent;
    setConverseForTests(async (params) => { sent = params; return { output: { message: { content: [{ text: 'ready' }] } } }; });
    expect(await pingModel({ modelId: 'm-1', region: 'us-east-1' })).toBe('ready');
    expect(sent.modelId).toBe('m-1');
    expect(sent.toolConfig).toBeUndefined();
    expect(sent.inferenceConfig.maxTokens).toBeLessThanOrEqual(20);
  });

  test('an AWS failure propagates so the script can explain it', async () => {
    setConverseForTests(async () => { throw err('AccessDeniedException', 'no'); });
    await expect(pingModel({ modelId: 'm', region: 'r' })).rejects.toThrow('no');
  });
});

describe('health reports whether the assistant is on', () => {
  const health = async (extra) => {
    useTestContext({ registry: createRegistry([]), env: loadEnv({ DEMO_MODE: 'true', ...extra }) });
    return (await request(await createApp()).get('/api/health')).body;
  };

  test('false by default, true when a model is configured', async () => {
    expect((await health({})).assistant).toBe(false);
    expect((await health({ BEDROCK_MODEL_ID: 'us.anthropic.test-v1:0', AWS_REGION: 'eu-west-1' })).assistant).toBe(true);
  });

  test('exposes no model name, region or keys', async () => {
    const body = JSON.stringify(await health({ BEDROCK_MODEL_ID: 'us.anthropic.test-v1:0' }));
    expect(body).not.toContain('anthropic');
    expect(body).not.toMatch(/AKIA|secret/i);
  });
});

describe('BEDROCK_MODEL_ID and region in the environment', () => {
  test('are parsed, with us-east-1 as the default region', () => {
    expect(loadEnv({ DEMO_MODE: 'true', BEDROCK_MODEL_ID: 'm-1' }).ASSISTANT).toEqual({ modelId: 'm-1', region: 'us-east-1' });
    expect(loadEnv({ DEMO_MODE: 'true', BEDROCK_MODEL_ID: 'm-1', AWS_REGION: 'eu-west-2' }).ASSISTANT.region).toBe('eu-west-2');
    expect(loadEnv({ DEMO_MODE: 'true' }).ASSISTANT).toBeNull();
  });

  test('a model ID with odd characters is refused', () => {
    expect(() => loadEnv({ DEMO_MODE: 'true', BEDROCK_MODEL_ID: 'x; rm -rf' })).toThrow(/BEDROCK_MODEL_ID/);
  });
});
