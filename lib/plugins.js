// ============================================
// lib/plugins.js - Plugin Loader (ESM)
// ============================================
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const commands = [];

export function Module(data) {
  return (execFunction) => {
    commands.push({ ...data, exec: execFunction });
  };
}

export async function loadPlugins(
  dir = path.join(__dirname, "..", "plugins")
) {
  try {
    // NOTE:
    // ESM modules are cached by Node. Re-importing the same file does not re-run
    // top-level code, so clearing and re-importing can leave `commands` empty.
    // To avoid that problem and to be safe for multi-session usage, we load
    // plugins only once and return a snapshot (shallow copy) of the registered
    // commands. This prevents race conditions where one session's plugin load
    // would clear registrations used by other active sessions.

    // If commands already have entries, just return a snapshot.
    if (commands.length > 0) {
      return commands.slice();
    }

    const files = await fs.readdir(dir);

    for (const file of files) {
      if (!file.endsWith(".js")) continue;

      try {
        const filePath = path.join(dir, file);

        // Use import() for ESM dynamic loading. Modules will run once and
        // call Module(...) which pushes into the `commands` array.
        await import(`file://${filePath}`);

        console.log(`✅ plugin: ${file}`);
      } catch (err) {
        console.warn(`⚠️ Error loading plugin ${file}:`, err.message);
      }
    }

    console.log(`📦 Loaded ${commands.length} commands`);
    // Return a shallow copy so callers get a stable snapshot we won't mutate later
    return commands.slice();
  } catch (err) {
    console.error("❌ Failed to load plugins:", err.message);
    return [];
  }
}

export { commands as default };

