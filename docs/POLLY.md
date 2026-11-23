# Turning on Amazon Polly (spoken answers)

The chat page always shows its answers as text. By default it reads them aloud with the browser's own voice, which needs no setup. With Amazon Polly switched on, the server speaks them instead, in a more natural voice. If Polly is off, or a request to it fails, the page falls back to the browser voice, so an answer is never silent because of AWS.

Listening (the microphone) always uses the browser's speech recognition. Nothing is sent to AWS except the text of an answer that is about to be spoken.

## What to set

| Variable | Value | Where it comes from |
|---|---|---|
| `VOICE_PROVIDER` | `polly` | you choose; leave it as `browser` to keep the browser voice |
| `AWS_ACCESS_KEY_ID` | the IAM user's access key ID | step 2 below |
| `AWS_SECRET_ACCESS_KEY` | the IAM user's secret key | step 2 below |
| `AWS_REGION` | for example `us-east-1` | any region that offers Polly |
| `POLLY_VOICE_ID` | optional, default `Joanna` | Polly voice list (for example `Matthew`, `Ruth`, `Amy`) |
| `POLLY_ENGINE` | optional, `neural` (default) or `standard` | use `standard` if a voice has no neural version |
| `POLLY_REGION` | optional, overrides `AWS_REGION` for Polly only | |

Put them in `server/.env` for local use and in the host's environment settings (Render) for the live site. Never commit them: `.env` is git-ignored.

## Steps

1. **Create an IAM user** (AWS console, IAM, Users, Create user). Give it no console access.
2. **Attach this policy**, the smallest one that works, then create an access key for the user (Security credentials, Create access key, "Application running outside AWS"):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["polly:SynthesizeSpeech"],
    "Resource": "*"
  }]
}
```

3. **Check it locally.** Put the variables in `server/.env`, then run:

```
npm run voice:test --prefix skeleton/server
```

It speaks one sentence and saves it as an mp3 in your temp folder so you can listen. It never prints your keys.

4. **Switch it on live.** On Render, open the API service, Environment, add the variables above, and redeploy. Open `/api/health`: `voiceProvider` should read `polly`.

## Limits and cost

- Each signed-in user may ask for 30 spoken answers per 10 minutes, and each answer is cut at 1,500 characters.
- Polly is billed per character. Check the current price and free tier on the AWS Polly pricing page before a public demo.

## If `voice:test` fails

| It says | Cause | Fix |
|---|---|---|
| No AWS credentials found | the keys are not in `server/.env` or the environment | add both variables |
| AWS rejected the credentials | a typo, or a stray space or quote | copy both values again |
| The AWS credentials have expired | temporary keys | create an IAM user's long-lived key |
| The IAM user may not call Polly | the policy is missing | attach the policy in step 2 |
| Polly does not know that voice | typo in `POLLY_VOICE_ID` | use a name from the Polly voice list |
| That voice does not support this engine | no neural version of that voice | set `POLLY_ENGINE=standard` |
| Polly is rate limiting this account | a quota | wait a minute and retry |

## Turning it off

Set `VOICE_PROVIDER=browser` (or delete it) and redeploy. To rotate keys, create a new access key, update the host, then delete the old key in IAM.
