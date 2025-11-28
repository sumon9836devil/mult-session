import os from "os";
import { Module, commands } from "../lib/plugins.js";
import { getRandomPhoto } from "./bin/menu_img.js";
import config from "../config.js";
import cache from "../lib/cache.js";

const name = "X-kira ━ 𝐁𝕺𝐓";
const MENU_CACHE_KEY = "menu:grouped_commands";
const MENU_CACHE_TTL = 300; // 5 minutes

const runtime = (secs) => {
  const pad = (s) => s.toString().padStart(2, "0");
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
};

const readMore = String.fromCharCode(8206).repeat(4001);

// Build grouped commands from current plugin list
function buildGroupedCommands() {
  return commands
    .filter((cmd) => cmd.command && cmd.command !== "undefined")
    .reduce((acc, cmd) => {
      if (!acc[cmd.package]) acc[cmd.package] = [];
      acc[cmd.package].push(cmd.command);
      return acc;
    }, {});
}

// Get grouped commands from cache or rebuild
async function getGroupedCommands() {
  try {
    const cached = await cache.get(MENU_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    // cache miss or error; rebuild
  }

  const grouped = buildGroupedCommands();
  try {
    await cache.set(MENU_CACHE_KEY, JSON.stringify(grouped), MENU_CACHE_TTL);
  } catch (e) {
    // ignore cache set errors
  }
  return grouped;
}

// Menu command
Module({
  command: "menu",
  package: "general",
  description: "Show all commands or a specific package",
})(async (message, match) => {
    try {
      const time = new Date().toLocaleTimeString("en-ZA", {
        timeZone: "Africa/Johannesburg",
      });
      const mode = config.WORK_TYPE || process.env.WORK_TYPE;
      const userName = message.pushName || "User";
      const usedGB = ((os.totalmem() - os.freemem()) / 1073741824).toFixed(2);
      const totGB = (os.totalmem() / 1073741824).toFixed(2);
      const ram = `${usedGB} / ${totGB} GB`;

      // Use cached grouped commands instead of rebuilding every time
      const grouped = await getGroupedCommands();

      const categories = Object.keys(grouped).sort();
      let _cmd_st = "";

      if (match && grouped[match.toLowerCase()]) {
        const pack = match.toLowerCase();
        _cmd_st += `\n *╭────❒ ${pack.toUpperCase()} ❒⁠⁠⁠⁠*\n`;
        grouped[pack]
          .sort((a, b) => a.localeCompare(b))
          .forEach((cmdName) => {
            _cmd_st += ` *├◈ ${cmdName}*\n`;
          });
        _cmd_st += ` *┕──────────────────❒*\n`;
      } else {
        _cmd_st += `
*╭══〘〘 ${name} 〙〙*
*┃❍ ʀᴜɴ     :* ${runtime(process.uptime())}
*┃❍ ᴍᴏᴅᴇ    :* Public
*┃❍ ᴘʀᴇғɪx  :* ${config.prefix}
*┃❍ ʀᴀᴍ     :* ${ram}
*┃❍ ᴛɪᴍᴇ    :* ${time}
*┃❍ ᴜsᴇʀ    :* ${userName}
*╰═════════════════⊷*
${readMore}
*♡︎•━━━━━━☻︎━━━━━━•♡︎*
`;

        if (match && !grouped[match.toLowerCase()]) {
          _cmd_st += `\n⚠️ *Package not found: ${match}*\n\n`;
          _cmd_st += `*Available Packages*:\n`;
          categories.forEach((cat) => {
            _cmd_st += `├◈ ${cat}\n`;
          });
        } else {
          for (const cat of categories) {
            _cmd_st += `\n *╭────❒ ${cat.toUpperCase()} ❒⁠⁠⁠⁠*\n`;
            grouped[cat]
              .sort((a, b) => a.localeCompare(b))
              .forEach((cmdName) => {
                _cmd_st += ` *├◈ ${cmdName}*\n`;
              });
            _cmd_st += ` *┕──────────────────❒*\n`;
          }
        }

        _cmd_st += `\n💖 *~_Made with love by X-kira_~*`;
      }

      const channelJid = "120363400835083687@newsletter";
      const channelName = "© X-kira";
      const serverMessageId = 6;

      const opts = {
        image: { url: getRandomPhoto() || "https://files.catbox.moe/n9ectm.jpg" },
        caption: _cmd_st,
        mimetype: "image/jpeg",
        contextInfo: {
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: channelJid,
            newsletterName: channelName,
            serverMessageId: serverMessageId,
          },
        },
      };

      await message.conn.sendMessage(message.from, opts);
    } catch (err) {
      console.error("❌ Menu command error:", err);
      await message.conn.sendMessage(message.from, {
        text: `❌ Error: ${err.message}`,
      });
    }
  });

  // List command
  Module({
    command: "list",
    package: "general",
    description: "List all available commands",
  })(async (message) => {
    try {
      const aca = commands
        .filter((cmd) => cmd.command && cmd.command !== "undefined")
        .map((cmd) => cmd.command)
        .join("\n");
      await message.conn.sendMessage(message.from, {
        text: `*List:*\n${aca}`,
      });
    } catch (err) {
      console.error("❌ List command error:", err);
      await message.conn.sendMessage(message.from, {
        text: `❌ Error: ${err.message}`,
      });
    }
  });

  // Alive command
  Module({
    command: "alive",
    package: "general",
    description: "Check if bot is alive",
  })(async (message) => {
    try {
      const hostname = os.hostname();
      const time = new Date().toLocaleTimeString("en-ZA", {
        timeZone: "Africa/Johannesburg",
      });
      const ramUsedMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      const ctx = `
*${name}* is online

*Time:* ${time}
*Host:* ${hostname}
*RAM Usage:* ${ramUsedMB} MB
*Uptime:* ${hours}h ${minutes}m ${seconds}s
`;

      await message.conn.sendMessage(message.from, {
        image: { url: getRandomPhoto() },
        caption: ctx,
      });
    } catch (err) {
      console.error("❌ Alive command error:", err);
      await message.conn.sendMessage(message.from, {
        text: `❌ Error: ${err.message}`,
      });
    }
  });

  

