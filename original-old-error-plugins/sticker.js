import { Module } from "../lib/plugins.js";
import sticker from "../lib/sticker.js";
import config from "../config.js";

export default Module({
  command: "take",
  package: "media",
  description: "Change sticker packname and author",
})(async (message, match) => {
  try {
    let mediaa = message.quoted || message;
    if (mediaa.type !== "stickerMessage") {
      return await message.conn.sendMessage(message.from, {
        text: "⚠️ _Reply to a sticker_",
      });
    }

    const [packname, author] = (match?.split("|").map((s) => s.trim()) || []);

    if (!packname || !author) {
      return await message.conn.sendMessage(message.from, {
        text: "_Usage: .take new pack | new author_",
      });
    }

    const media = await mediaa.download();
    const buffer = await sticker.addExif(media, {
      packname,
      author,
    });

    await message.conn.sendMessage(message.from, {
      sticker: buffer,
    });
  } catch (err) {
    console.error("❌ Take command error:", err);
    await message.conn.sendMessage(message.from, {
      text: `❌ Error: ${err.message}`,
    });
  }
});

Module({
  command: "sticker",
  package: "media",
  description: "Convert image/video to sticker",
})(async (message) => {
  try {
    let mediaa = message.quoted || message;

    if (!/image|video|gif/.test(mediaa.type)) {
      return await message.conn.sendMessage(message.from, {
        text: "⚠️ _Reply to an image or video_",
      });
    }

    const media = await mediaa.download();
    const buffer = await sticker.toSticker(mediaa.type, media, {
      packname: config.packname || "Bot Sticker",
      author: config.author || "Bot",
    });

    await message.conn.sendMessage(message.from, {
      sticker: buffer,
    });
  } catch (err) {
    console.error("❌ Sticker command error:", err);
    await message.conn.sendMessage(message.from, {
      text: `❌ Error: ${err.message}`,
    });
  }
});
