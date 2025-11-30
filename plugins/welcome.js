const { Module } = require("../lib/plugins");
const { personalDB } = require("../lib/database");
const { getTheme } = require("../Themes/themes");
const theme = getTheme();

// Shared defaults
const DEFAULT_WELCOME = `
*╭─〘 𝑾𝑬𝑳𝑪𝑶𝑴𝑬 〙─╮*
│ Hey &mention 🎉
│ Group: *&name*
│ Members: *&size*
╰─&pp`;

const DEFAULT_GOODBYE = `
*╭─〘 𝑮𝑶𝑶𝑫𝑩𝒀𝑬 〙─╮*
│ Bye &mention 👋
│ From *&name*
│ Remaining: *&size*
╰─&pp`;

// ================= WELCOME =================
Module({
  command: "welcome",
  package: "owner",
  description: "Global welcome setup",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);
  const botNumber = message.conn.user.id.split(":")[0];
  match = (match || "").trim();

  const { welcome } =
    (await personalDB(["welcome"], {}, "get", botNumber)) || {};
  const status = welcome?.status === "true" ? "true" : "false";
  const currentMsg = welcome?.message || "";

  if (match.toLowerCase() === "get") {
    return await message.send(
      `*Current Welcome Message:*\n${currentMsg || DEFAULT_WELCOME}\n\nStatus: ${
        status === "true" ? "✅ ON" : "❌ OFF"
      }`
    );
  }

  if (match.toLowerCase() === "on" || match.toLowerCase() === "off") {
    const isOn = match.toLowerCase() === "on";
    await personalDB(
      ["welcome"],
      { content: { status: isOn ? "true" : "false", message: currentMsg || DEFAULT_WELCOME } },
      "set",
      botNumber
    );
    return await message.send(`✅ Welcome is now *${isOn ? "ON" : "OFF"}*`);
  }

  if (match.length) {
    await personalDB(
      ["welcome"],
      { content: { status, message: match } },
      "set",
      botNumber
    );
    return await message.send("✅ Custom welcome message saved!");
  }

  return await message.send(
    `*Usage:*\n.welcome on/off/get\n.welcome <message>\n\n*Supports:* &mention, &name, &size, &pp`
  );
});

// ================= GOODBYE =================
Module({
  command: "goodbye",
  package: "owner",
  description: "Global goodbye setup",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);
  const botNumber = message.conn.user.id.split(":")[0];
  match = (match || "").trim();

  const { exit } = (await personalDB(["exit"], {}, "get", botNumber)) || {};
  const status = exit?.status === "true" ? "true" : "false";
  const currentMsg = exit?.message || "";

  if (match.toLowerCase() === "get") {
    return await message.send(
      `*Current Goodbye Message:*\n${currentMsg || DEFAULT_GOODBYE}\n\nStatus: ${
        status === "true" ? "✅ ON" : "❌ OFF"
      }`
    );
  }

  if (match.toLowerCase() === "on" || match.toLowerCase() === "off") {
    const isOn = match.toLowerCase() === "on";
    await personalDB(
      ["exit"],
      { content: { status: isOn ? "true" : "false", message: currentMsg || DEFAULT_GOODBYE } },
      "set",
      botNumber
    );
    return await message.send(`✅ Goodbye is now *${isOn ? "ON" : "OFF"}*`);
  }

  if (match.length) {
    await personalDB(
      ["exit"],
      { content: { status, message: match } },
      "set",
      botNumber
    );
    return await message.send("✅ Custom goodbye message saved!");
  }

  return await message.send(
    `*Usage:*\n.goodbye on/off/get\n.goodbye <message>\n\n*Supports:* &mention, &name, &size, &pp`
  );
});