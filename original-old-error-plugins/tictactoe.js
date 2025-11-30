import { Module } from '../lib/plugins.js';
import TicTacToe from '../lib/tictactoe-d.js';
import cache from '../lib/cache.js';

const PREFIX = 'ttt:';
const TTL = 1800; // 30 minutes

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

function serializeGame(game) {
  return {
    p1: game.p1,
    p2: game.p2,
    _playerTurn: game._playerTurn,
    _p1Board: game._p1Board,
    _p2Board: game._p2Board,
    totalMoves: game.totalMoves
  };
}

function deserializeGame(data) {
  const g = new TicTacToe(data.p1, data.p2);
  g._playerTurn = data._playerTurn;
  g._p1Board = data._p1Board;
  g._p2Board = data._p2Board;
  g.totalMoves = data.totalMoves || 0;
  return g;
}

export default Module({
  command: 'ttt',
  package: 'games',
  description: 'TicTacToe game',
})(async (message, match) => {
  if (!message.isGroup) return;
  const input = match?.trim() || '';
  const is_ai = input === '--auto';
  const existing = await getSession(message.from);
  if (existing) return await message.send('_A game is already running_');
  const mention = message.raw.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  const reply = message.quoted?.sender;
  const opponent = mention || reply || (is_ai ? 'auto' : null);
  if (!opponent) return await message.send('_Please mention a user, reply to someone, or use --auto to play against bot_');
  const game = new TicTacToe(message.sender, opponent === 'auto' ? 'bot' : opponent);
  const session = {
    starter: message.sender,
    opponent,
    gameState: serializeGame(game),
    state: 'PLAYING',
    isAuto: opponent === 'auto',
    chatId: message.from,
    id: 'ttt-' + Date.now()
  };
  await setSession(message.from, session);
  const dis = `\n🎮 *TicTacToe*\n\nTurn ${game.activePlayer.split('@')[0]}...\n\n${srt_r(game.displayBoard())}\n\n▢ Room ID: ${session.id}\n▢ Player ❎: ${game.p1.split('@')[0]}\n▢ Player ⭕: ${session.isAuto ? 'Bot' : game.p2.split('@')[0]}\n• use num (1-9)\n• *surrender* to give up\n`;

  if (session.isAuto) {
    await message.send(dis);
  } else {
    await message.send({ text: dis, mentions: [game.p1, game.p2] });
  }
});

Module({
  on: 'text',
})(async (message) => {
  const session = await getSession(message.from);
  if (!session) return;
  const body = message.body.trim();
  const s_id = message.sender;
  const gameData = session.gameState;
  let game = deserializeGame(gameData);

  if (/^(surrender|give up)$/i.test(body)) {
    if (session.isAuto && s_id === game.p1) {
      await message.send(`🏳️ ${s_id.split('@')[0]} surrendered, Bot wins\n▢ Room ID: ${session.id}`);
      await delSession(message.from);
      return;
    } else if (!session.isAuto && [game.p1, game.p2].includes(s_id)) {
      const winner = s_id === game.p1 ? game.p2 : game.p1;
      await message.send(`🏳️ ${s_id.split('@')[0]} surrendered ${winner.split('@')[0]} wins\n▢ Room ID: ${session.id}`);
      await delSession(message.from);
      return;
    }
  }

  if (session.isAuto) {
    if (s_id !== game.p1) return;
  } else {
    if (![game.p1, game.p2].includes(s_id)) return;
    if (s_id !== game.activePlayer) return;
  }
  if (!/^[1-9]$/.test(body)) return;
  const pos = parseInt(body) - 1;
  const ok = game.play(pos);
  if (!ok) return message.send('_Position is already taken_');

  const mover = () => {
    if (game.victor || game.totalMoves === 9) return;
    const ap = [];
    for (let i = 0; i < 9; i++) {
      if (!((game._p1Board | game._p2Board) & (1 << i))) {
        ap.push(i);
      }
    }
    if (ap.length > 0) {
      const ra = ap[Math.floor(Math.random() * ap.length)];
      game.play(ra);
    }
  };
  if (session.isAuto && game.activePlayer === 'bot' && !game.victor && game.totalMoves < 9) {
    mover();
  }
  const winner = game.victor;
  const tie = game.totalMoves === 9;
  let status;
  if (winner) {
    if (session.isAuto) {
      status = winner === game.p1 ? `🎉 ${winner.split('@')[0]} wins` : '🎉 Bot wins';
    } else {
      status = `🎉 ${winner.split('@')[0]} wins`;
    }
  } else if (tie) {
    status = '🤝 Game ended in a draw';
  } else {
    if (session.isAuto) {
      status = game.activePlayer === game.p1 ? `🎲 Turn: ${game.activePlayer.split('@')[0]}` : '🎲 Turn: Bot';
    } else {
      status = `🎲 Turn: ${game.activePlayer.split('@')[0]}`;
    }
  }

  // persist updated game
  session.gameState = serializeGame(game);
  await setSession(message.from, session);

  const dis = `\n🎮 *TicTacToe*\n\n${status}\n\n${srt_r(game.displayBoard())}\n\n▢ Room ID: ${session.id}\n▢ Player ❎: ${game.p1.split('@')[0]}\n▢ Player ⭕: ${session.isAuto ? 'Bot' : game.p2.split('@')[0]}\n${!winner && !tie ? '• use number (1-9)\n• *surrender* to give up' : ''}\n`;

  await message.send(dis);
  if (winner || tie) await delSession(message.from);
});

