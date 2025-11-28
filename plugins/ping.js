import { Module } from "../lib/plugins.js";

export default Module({
  command: "ping",
  package: "general",
  description: "Replies with the bot latency",
})(async (message) => {
  try {
    const start = Date.now();
    const latency = Date.now() - start;

    const emojis = [
      "⛅", "👻", "⛄", "👀", "🪁", "🎳", "🌸", "🍓",
      "💗", "🦋", "💫", "💀", "⚡", "🌟", "🪐", "🌙",
      "🌲", "🍃", "🍂", "🍁", "🍄", "🌿", "🐞", "🐍",
      "🕊️", "🕷️", "🕸️", "🎃", "🏟️", "🎡", "🥂", "🗿",
    ];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];

    // React with emoji
    try {
      await message.conn.sendMessage(
        message.from,
        { react: { text: emoji, key: message.key } }
      );
    } catch (e) {
      // Emoji react failed, continue anyway
    }

    // Send pong response
    await message.conn.sendMessage(message.from, {
      text: `*${emoji} Pong! ${latency}ms*`,
      contextInfo: {
        forwardingScore: 5,
        isForwarded: false,
      },
    });
  } catch (err) {
    console.error("❌ Ping command error:", err);
    try {
      await message.conn.sendMessage(message.from, {
        text: `❌ Error: ${err.message}`,
      });
    } catch (e) {
      console.error("Failed to send error message:", e);
    }
  }
});
