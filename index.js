import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.urlencoded({ extended: true })); // для Slash-команд
app.use(express.json());

// 🔐 Переменные среды (из Render)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = process.env.ASSISTANT_ID;

// 🔐 Данные Mattermost (необязательно выносить в .env — уже известны)
const MM_API_TOKEN = 'gnwoiuo19bddfdwjbis6fs6dfo';
const MM_API_BASE = 'https://mmost.x620.net/api/v4';

// === 1. Slash-команда Mattermost ===

app.post('/slash/assist', async (req, res) => {
  const { text, user_name, channel_id } = req.body;

  console.log(`📨 Команда от ${user_name}: ${text}`);

  if (!text) {
    res.send("❌ Пожалуйста, укажите вопрос после `/assist`");
    return;
  }

  res.send("⏳ GPT-ассистент обрабатывает ваш запрос...");

  try {
    const reply = await getAssistantReply(text);

    const message = `💬 **${user_name} спросил:** ${text}\n\n🤖 **Ответ:** ${reply}`;
    await postAsBot(channel_id, message);
  } catch (err) {
    console.error("🔥 Ошибка:", err);
    await postAsBot(channel_id, `❌ Ошибка: ${err.message}`);
  }
});

// === 2. Тестовый POST-запрос (например из Postman)

app.post('/support', async (req, res) => {
  const { question } = req.body;

  if (!question) return res.status(400).json({ error: 'Missing question' });

  try {
    const reply = await getAssistantReply(question);
    const text = `💬 Запрос: ${question}\n\n🤖 Ответ: ${reply}`;
    await postAsBot('izy7u9nhaid75pw1677coahtiw', text);
    res.status(200).json({ result: 'Отправлено в Mattermost', reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (_, res) => res.send('✅ GPT Support Assistant работает!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер работает на http://localhost:${PORT}`));

// === OpenAI Assistant ===

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
    }).then(r => r.json());

    status = runCheck.status;
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

// === Отправка в Mattermost от имени бота ===

async function postAsBot(channel_id, message) {
  const response = await fetch(`${MM_API_BASE}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MM_API_TOKEN}`
    },
    body: JSON.stringify({
      channel_id,
      message
    })
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('❌ Ошибка отправки в Mattermost:', text);
  } else {
    console.log('📤 Сообщение отправлено в Mattermost');
  }
}

// === Заголовки для OpenAI ===

function openaiHeaders() {
  return {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  };
}
