import { Module } from "../lib/plugins.js";

export default Module({
  command: "uptime",
  package: "general",
  description: "Shows how long the bot has been running",
})(async (message) => {
  try {
    const tts = process.uptime();
    const days = Math.floor(tts / 86400);
    const hours = Math.floor((tts % 86400) / 3600);
    const minutes = Math.floor((tts % 3600) / 60);
    const seconds = Math.floor(tts % 60);
    const uptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    await message.conn.sendMessage(message.from, {
      text: `⏱️ *Bot Uptime:* \`${uptime}\``,
    });
  } catch (err) {
    console.error("❌ Uptime command error:", err);
    await message.conn.sendMessage(message.from, {
      text: `❌ Error: ${err.message}`,
    });
  }
});
