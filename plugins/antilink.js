// plugins/antilink.js
import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";

Module({
  command: "antilink",
  package: "owner",
  description:
    "Enable/disable anti-link for this group or set mode (kick/null). Default mode: kick",
})(async (message, match) => {
  // only allow owner/bot to change settings (keep as before)
  if (!message.isFromMe)
    return message.send("❌ Only bot owner can use this command.");
  if (!message.isGroup)
    return message.send("❌ This command works only in groups.");

  const botNumber =
    (message.conn?.user?.id && String(message.conn.user.id).split(":")[0]) ||
    "unknown";
  const groupJid = message.from;
  const raw = (match || "").trim().toLowerCase();

  // status + usage
  const enabledKey = `antilink:${groupJid}:enabled`;
  const modeKey = `antilink:${groupJid}:mode`;

  // show status if no args
  if (!raw) {
    const isEnabled = db.get(botNumber, enabledKey, false) === true;
    const mode = db.get(botNumber, modeKey, "kick") || "kick";
    return message.send(
      `⚙️ AntiLink for this group\n• Status: ${
        isEnabled ? "✅ ON" : "❌ OFF"
      }\n• Mode: ${mode.toUpperCase()}\n\nUsage:\n• .antilink on\n• .antilink off\n• .antilink kick\n• .antilink null`
    );
  }

  // allow commands like ".antilink on" or ".antilink kick"
  if (raw === "on") {
    const already = db.get(botNumber, enabledKey, false) === true;
    const currentMode = db.get(botNumber, modeKey, "kick") || "kick";
    if (already) {
      return message.send(
        `ℹ️ AntiLink is already *ON* for this group (mode: *${currentMode.toUpperCase()}*).`
      );
    }
    // enable and ensure default mode is set to kick if not set
    db.setHot(botNumber, enabledKey, true);
    // set default mode to kick if not present
    const hasMode = db.get(botNumber, modeKey, null);
    if (!hasMode) db.setHot(botNumber, modeKey, "kick");
    return message.send(
      `✅ AntiLink has been *ENABLED* for this group. Default action: *KICK* (you can change with .antilink kick/null).`
    );
  }

  if (raw === "off") {
    const already = db.get(botNumber, enabledKey, false) === false;
    if (already) {
      return message.send("ℹ️ AntiLink is already *OFF* for this group.");
    }
    db.setHot(botNumber, enabledKey, false);
    // keep mode key (optional). You can remove it if you want.
    return message.send("✅ AntiLink has been *DISABLED* for this group.");
  }

  // mode switches
  if (raw === "kick" || raw === "null") {
    // set mode
    db.setHot(botNumber, modeKey, raw);
    // If enabling mode to kick but feature is off, enable it automatically (smart convenience)
    const isEnabled = db.get(botNumber, enabledKey, false) === true;
    if (!isEnabled) {
      db.setHot(botNumber, enabledKey, true);
      return message.send(
        `✅ AntiLink mode set to *${raw.toUpperCase()}* and AntiLink has been automatically *ENABLED* for this group.`
      );
    }
    return message.send(
      `✅ AntiLink mode updated to *${raw.toUpperCase()}* for this group.`
    );
  }

  // fallback: unknown arg
  return message.send(
    "Usage:\n.antilink on\n.antilink off\n.antilink kick\n.antilink null"
  );
});
