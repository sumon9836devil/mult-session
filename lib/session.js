// ============================================
// lib/session.js - Session Management (ESM)
// ============================================
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const sessions = new Map();

export async function saveSession(sessionId, data) {
  try {
    const sessionPath = path.join(__dirname, "..", "auth", `${sessionId}.json`);
    await fs.ensureDir(path.dirname(sessionPath));
    await fs.writeJSON(sessionPath, data, { spaces: 2 });
    console.log(`✅ [${sessionId}] Session saved`);
  } catch (err) {
    console.error(`❌ [${sessionId}] Failed to save session:`, err);
  }
}

export async function loadSession(sessionId) {
  try {
    const sessionPath = path.join(__dirname, "..", "auth", `${sessionId}.json`);
    if (await fs.pathExists(sessionPath)) {
      return await fs.readJSON(sessionPath);
    }
  } catch (err) {
    console.error(`❌ [${sessionId}] Failed to load session:`, err);
  }
  return null;
}

export async function getAllSessions() {
  try {
    const authDir = path.join(__dirname, "..", "auth");
    if (!(await fs.pathExists(authDir))) {
      return [];
    }
    const files = await fs.readdir(authDir);
    const sessions = [];
    for (const file of files) {
      if (file.endsWith(".json") && file !== "creds.json") {
        const sessionData = await fs.readJSON(
          path.join(authDir, file)
        );
        sessions.push({
          sessionId: file.replace(".json", ""),
          ...sessionData,
        });
      }
    }
    return sessions;
  } catch (err) {
    console.error("❌ Failed to get all sessions:", err);
    return [];
  }
}

export async function deleteSession(sessionId) {
  try {
    const sessionPath = path.join(__dirname, "..", "auth", `${sessionId}.json`);
    await fs.remove(sessionPath);
    console.log(`✅ [${sessionId}] Session deleted`);
  } catch (err) {
    console.error(`❌ [${sessionId}] Failed to delete session:`, err);
  }
}

export async function restoreSessions() {
  try {
    const allSessions = await getAllSessions();
    console.log(`🔄 Found ${allSessions.length} saved sessions`);
    return allSessions;
  } catch (err) {
    console.error("❌ Failed to restore sessions:", err);
    return [];
  }
}

