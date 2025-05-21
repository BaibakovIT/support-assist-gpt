import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = process.env.ASSISTANT_ID;

app.get('/', (_, res) => res.send('✅ GPT Proxy работает!'));

app.post('/gpt', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  try {
    const reply = await getAssistantReply(prompt);
    res.status(200).json({ reply });
  } catch (err) {
    console.error("❌ Ошибка в /gpt:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер запущен на http://localhost:${PORT}`));

// === GPT Assistant API ===
async function getAssistantReply(prompt) {
  console.log('🔧 Создание thread...');
  const thread = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers: openaiHeaders(),
    body: JSON.stringify({})
  }).then(r => r.json());

  await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
    method: 'POST',
    headers: openaiHeaders(),
    body: JSON.stringify({ role: 'user', content: prompt })
  });

  const run = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
    method: 'POST',
    headers: openaiHeaders(),
    body: JSON.stringify({ assistant_id: ASSISTANT_ID })
  }).then(r => r.json());

  let status = 'queued';
  let retries = 15;

  while (status !== 'completed' && retries > 0) {
    await new Promise(r => setTimeout(r, 2000));

    const runCheck = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
      headers: openaiHeaders()
    });

    const runCheckJson = await runCheck.json();
    status = runCheckJson.status;
    console.log(`⏳ Статус выполнения: ${status}`);
    if (['failed', 'cancelled', 'expired'].includes(status)) {
      throw new Error('Ассистент завершил run с ошибкой: ' + status);
    }

    retries--;
  }

  const msgRes = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
    headers: openaiHeaders()
  }).then(r => r.json());

  const replyMsg = msgRes.data.find(m => m.role === 'assistant');
  const reply = replyMsg?.content?.[0]?.text?.value || 'GPT не вернул ответ';
  console.log('✅ Ответ GPT:', reply);
  return reply;
}

function openaiHeaders() {
  return {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v2'
  };
}
