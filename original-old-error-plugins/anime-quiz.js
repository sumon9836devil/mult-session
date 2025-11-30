import { Module } from '../lib/plugins.js';
import { Quiz } from 'anime-quiz';
import cache from '../lib/cache.js';

const PREFIX = 'animequiz:';
const TTL = 600; // 10 minutes per game

async function getSession(chatId) {
  const raw = await cache.get(PREFIX + chatId);
  return raw ? JSON.parse(raw) : null;
}

async function setSession(chatId, session) {
  await cache.set(PREFIX + chatId, JSON.stringify(session), TTL);
}

async function delSession(chatId) {
  await cache.del(PREFIX + chatId);
}

export default Module({
  command: 'animequiz',
  package: 'games',
  description: 'Anime quiz game for groups only',
})(async (message, match) => {
  if (!message.isGroup) return;
  const existing = await getSession(message.from);
  if (existing) return await message.reply('_A quiz is already running_');
  const count = Math.min(parseInt(match) || 6, 20);
  // create first question
  const quiz = new Quiz();
  const q = quiz.getRandom();
  const session = {
    starter: message.sender,
    score: 0,
    lives: 3,
    total: 1,
    max: count,
    current: q
  };
  await setSession(message.from, session);
  const options = q.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
  const content = `🎌 *Anime Quiz Game*\n\n🧠 *Question:*\n${q.question}\n\n🎯 *Options:*\n${options}\n\n❤️ *Lives:* ${session.lives}\n🏅 *Score:* ${session.score}\n📋 *Question:* ${session.total}/${session.max}\n\n*💬 Reply with the correct num (1-4)*`;
  await message.send(content);
});

Module({
  on: 'text',
})(async (message) => {
  const session = await getSession(message.from);
  if (!session || message.sender !== session.starter) return;
  const body = message.body.trim();
  if (!/^[1-4]$/.test(body)) return;
  const index = parseInt(body) - 1;
  const options = session.current.options;
  const correct = session.current.answer;
  const selected = options[index];
  if (!selected) return;
  let feedback;
  if (selected === correct) {
    session.score++;
    feedback = '✅ *Correct*';
  } else {
    session.lives--;
    feedback = `❌ *Wrong*\n✅ *Answer:* ${correct}`;
  }
  if (session.lives === 0 || session.total >= session.max) {
    await delSession(message.from);
    return await message.send(
      `🛑 *Game Over*\n\n🏅 *Final Score:* ${session.score} / ${session.total}`
    );
  }

  // generate next question on demand
  const quiz = new Quiz();
  const next = quiz.getRandom();
  session.current = next;
  session.total++;
  await setSession(message.from, session);
  const op = next.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
  const q = `${feedback}\n\n🧠 *Question:*\n${next.question}\n\n🎯 *Options:*\n${op}\n\n❤️ *Lives:* ${session.lives}\n🏅 *Score:* ${session.score}\n📋 *Question:* ${session.total}/${session.max}\n\n*💬 Reply with the correct num (1-4)*`;
  await message.send(q);
});
