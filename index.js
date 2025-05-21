import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = process.env.ASSISTANT_ID;
const MATTERMOST_WEBHOOK = process.env.MATTERMOST_WEBHOOK;

app.post('/support', async (req, res) => {
  const { question } = req.body;

  if (!question) return res.status(400).json({ error: 'Missing question' });

  try {
    const reply = await getAssistantReply(question);
    await sendToMattermost(`💬 *Запрос:* ${question}\n\n🤖 *Ответ:* ${reply}`);
    res.status(200).json({ result: 'Ответ отправлен', reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (_, res) => res.send('GPT Support Assistant is running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));

// ==== OpenAI Assistant ====

async function getAssistantReply(prompt) {
  const threadRes = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({})
  }).then(r => r.json());

  await fetch(`https://api.openai.com/v1/threads/${threadRes.id}/messages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ role: 'user', content: prompt })
  });

  const runRes = await fetch(`https://api.openai.com/v1/threads/${threadRes.id}/runs`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ assistant_id: ASSISTANT_ID })
  }).then(r => r.json());

  // Wait for completion
  let status = 'queued';
  let retries = 15;
  while (status !== 'completed' && retries > 0) {
    await new Promise(r => setTimeout(r, 2000));
    const runCheck = await fetch(`https://api.openai.com/v1/threads/${threadRes.id}/runs/${runRes.id}`, {
      headers: headers()
    }).then(r => r.json());

    status = runCheck.status;
    if (['failed', 'cancelled', 'expired'].includes(status)) throw new Error('Run failed: ' + status);
    retries--;
  }

const msgRes = await fetch(`https://api.openai.com/v1/threads/${threadRes.id}/messages`, {
  headers: headers()
}).then(r => r.json());

if (!msgRes.data || !Array.isArray(msgRes.data)) {
  throw new Error('OpenAI не вернул сообщений');
}

const replyMsg = msgRes.data.find(m => m.role === 'assistant');
const reply = replyMsg?.content?.[0]?.text?.value || 'GPT не вернул текст.';

}

async function sendToMattermost(text) {
  return await fetch(MATTERMOST_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
}

function headers() {
  return {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  };
}
