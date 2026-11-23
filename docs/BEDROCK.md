# Turning on the Bedrock chat assistant

The chat page already understands most questions with no AI: counts, lists, "overdue", dates, totals, "mine", lookups by ID and the add-a-note commands. The Bedrock assistant is an **optional extra** for questions the built-in parser cannot read, such as "give me a rundown of what is urgent and who owns it". With it off, nothing breaks.

## What it can and cannot do

- It answers by calling three **read-only** tools (`query_records`, `overview`, `lookup_id`). Each call runs through the same permission check as the rest of the app, so it can only see what the person asking may read.
- It cannot create, change or delete anything. Commands such as "add a note" never go through the model; they use the built-in parser and show a Confirm card.
- Text inside records is treated as data, never as instructions.
- Limits: 20 free-form questions per user per 10 minutes, at most 4 tool rounds per question, short answers (400 tokens). If the model fails or is unavailable, the user sees the normal "I didn't catch that" reply with example questions.
- The model never sees the database, only the results of those tool calls for the asking user.

## What you need

| Variable | Example | Where it comes from |
|---|---|---|
| `BEDROCK_MODEL_ID` | the ID or inference-profile ID from the console | Bedrock console, step 1 |
| `AWS_REGION` | `us-east-1` | the region where you enabled the model |
| `AWS_ACCESS_KEY_ID` | `AKIA…` | IAM access key, step 3 |
| `AWS_SECRET_ACCESS_KEY` | `…` | shown once when the key is created |

Keep all four out of git and out of chat. They go in `server/.env` (already git-ignored) for local use, and in the host's Environment settings (Render) for the live sites.

## Steps

1. **Enable a model.** AWS console, Amazon Bedrock, **Model access** (check the region in the top bar first). Request access to a model that supports **tool use** with the Converse API; the AWS docs list these in "Supported models and features for the Converse API". A small, fast model is enough. When it shows *Access granted*, open the model and copy its **Model ID**. If the ID only works through an inference profile (the error will say so), open **Inference profiles** instead and copy the profile ID, which starts with `us.`, `eu.` or `apac.`.
2. **Create a limited IAM user** with this policy and nothing else:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["bedrock:InvokeModel"],
         "Resource": [
           "arn:aws:bedrock:*::foundation-model/*",
           "arn:aws:bedrock:*:YOUR_ACCOUNT_ID:inference-profile/*"
         ]
       }
     ]
   }
   ```

   To tighten it further, replace the first `*` resource with the one model's ARN.
3. **Create an access key** for that user (use case: *Application running outside AWS*). Copy the secret now; AWS shows it once.
4. **Set a budget alert** (Billing, Budgets) of a few dollars. The assistant is rate limited, so cost stays small, but an alert costs nothing.
5. **Try it locally.** Add the four variables to `skeleton/server/.env`, then:

   ```bash
   npm run assistant:test --prefix skeleton/server
   npm run assistant:test --prefix skeleton/server -- "what needs my attention"
   ```

   It makes one tiny model call, then asks a real question against an in-memory copy of the demo data and prints the answer. It never prints your keys and never touches a real database. A failure comes with the action to take.
6. **Turn it on for the live sites.** In Render, for each of the three services, add the same four variables under Environment and redeploy. Then open `https://<your-api>.onrender.com/api/health`: it should say `"assistant": true`. (It only reports on or off; it never shows the model or keys.)
7. Open the chat page and ask something the parser cannot read, for example "give me a rundown of the urgent stuff".

## When something is wrong

| `assistant:test` says | Cause | Fix |
|---|---|---|
| No AWS credentials found | keys not in the environment | set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` |
| AWS rejected the credentials | a wrong or half-copied key, or the wrong region | re-copy both values; check `AWS_REGION` |
| The AWS credentials have expired | temporary keys | use an IAM user's access key |
| Model access has not been granted | step 1 not finished in this region | request the model in the console, in `AWS_REGION` |
| The IAM user may not call Bedrock | policy missing | attach the policy in step 2 |
| This model needs an inference profile ID | the model is not available on demand | use the inference-profile ID |
| Bedrock cannot find that model here | typo, or the model is not offered in that region | check the ID and the region |
| Bedrock is rate limiting this account | low default quota on a new account | wait, or request a quota increase |

## Rotating or turning it off

Delete `BEDROCK_MODEL_ID` from the host and redeploy: the assistant is off again and the chat falls back to the built-in parser. To rotate keys, create a new access key, update the host, then delete the old key in IAM.
