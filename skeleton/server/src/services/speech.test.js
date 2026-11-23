// Amazon Polly wrapper and the AWS error explainer. No network, no credentials.
import { jest } from '@jest/globals';
import { useTestContext } from '../../test/helpers.js';
import { speak, explainAwsError, setSpeechClientForTests } from './speechService.js';

const POLLY = { voiceId: 'Ruth', engine: 'standard', region: 'eu-west-2' };
afterEach(() => setSpeechClientForTests(null));

describe('speak', () => {
  test('sends the configured voice and returns the audio bytes', async () => {
    useTestContext({ env: { VOICE_PROVIDER: 'polly', POLLY } });
    const seen = [];
    setSpeechClientForTests({ send: async (c) => { seen.push(c.input); return { AudioStream: { transformToByteArray: async () => new Uint8Array([1, 2, 3, 4]) } }; } });
    const audio = await speak('Hello there');
    expect([...audio]).toEqual([1, 2, 3, 4]);
    expect(seen[0]).toEqual({ Text: 'Hello there', OutputFormat: 'mp3', VoiceId: 'Ruth', Engine: 'standard', TextType: 'text' });
  });

  test('reads async-iterable streams', async () => {
    useTestContext({ env: { VOICE_PROVIDER: 'polly', POLLY } });
    async function* chunks() { yield new Uint8Array([9]); yield new Uint8Array([8]); }
    setSpeechClientForTests({ send: async () => ({ AudioStream: chunks() }) });
    expect([...(await speak('x'))]).toEqual([9, 8]);
  });

  test('empty audio and AWS errors become a 502', async () => {
    useTestContext({ env: { VOICE_PROVIDER: 'polly', POLLY } });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    setSpeechClientForTests({ send: async () => ({}) });
    await expect(speak('x')).rejects.toMatchObject({ status: 502 });
    setSpeechClientForTests({ send: async () => { throw Object.assign(new Error('boom'), { name: 'ThrottlingException' }); } });
    await expect(speak('x')).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/rate limiting/) });
    spy.mockRestore();
  });

  test('is refused with 400 when the provider is the browser', async () => {
    useTestContext();
    await expect(speak('x')).rejects.toMatchObject({ status: 400 });
  });
});

describe('explainAwsError', () => {
  const cases = [
    [{ name: 'CredentialsProviderError', message: 'Could not load credentials from any providers' }, /No AWS credentials/],
    [{ name: 'ExpiredTokenException', message: 'The security token included in the request is expired' }, /expired/],
    [{ name: 'UnrecognizedClientException', message: 'The security token included in the request is invalid.' }, /rejected the credentials/],
    [{ name: 'AccessDeniedException', message: 'User is not authorized to perform: polly:SynthesizeSpeech' }, /may not call Polly/],
    [{ name: 'ValidationException', message: 'Voice Zed not found' }, /does not know that voice/],
    [{ name: 'ValidationException', message: 'Unsupported engine: neural not supported for this voice' }, /engine/],
    [{ name: 'ThrottlingException', message: 'Rate exceeded' }, /rate limiting/],
    [{ name: 'Error', message: 'getaddrinfo ENOTFOUND polly.us-east-1.amazonaws.com' }, /Could not reach AWS/],
    [{ name: 'Weird', message: 'something else' }, /returned an error/],
  ];
  test.each(cases)('%j', (err, title) => {
    expect(explainAwsError(err).title).toMatch(title);
    expect(explainAwsError(err).action.length).toBeGreaterThan(10);
  });
  test('tolerates nothing at all', () => {
    expect(explainAwsError(undefined).title).toMatch(/returned an error/);
  });
});
