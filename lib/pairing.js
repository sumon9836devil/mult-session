// ============================================
// lib/pairing.js - Pairing Code Generation (ESM)
// ============================================
import { createBaileysConnection } from "./connection.js";
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from "baileys";
import pino from "pino";

async function waitForOpen(sock, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sock.ev.off("connection.update", handler);
      reject(new Error("Timed out waiting for connection to open"));
    }, timeoutMs);

    const handler = (update) => {
      const { connection, lastDisconnect, qr } = update || {};
      // Debug: surface connection updates to help diagnose slow networks
      try {
        console.log(`pairing: connection.update => ${JSON.stringify({ connection, qr: !!qr })}`);
      } catch (e) {
        // ignore stringify errors
      }

      // If a QR is emitted, the socket is connected enough for pairing
      if (qr) {
        clearTimeout(timeout);
        sock.ev.off("connection.update", handler);
        resolve();
        return;
      }

      if (connection === "open") {
        clearTimeout(timeout);
        sock.ev.off("connection.update", handler);
        resolve();
        return;
      } else if (connection === "close") {
        clearTimeout(timeout);
        sock.ev.off("connection.update", handler);
        const err = lastDisconnect?.error || new Error("Connection closed before open");
        reject(err);
      }
    };

    sock.ev.on("connection.update", handler);
  });
}

async function ensureWsReady(sock, timeoutMs = 5000) {
  const start = Date.now();
  // If there's no ws object, bail fast
  while (Date.now() - start < timeoutMs) {
    try {
      if (sock.ws && sock.ws.readyState === 1) return true;
    } catch (e) {
      // ignore
    }
    // small delay
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export async function generatePairingCode(sessionId, phoneNumber) {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, "");

  // Try establishing a temporary socket for pairing to avoid interfering
  // with existing sessions. This uses a separate auth folder under ./auth/pair-<id>.
  try {
    const authFolder = `./auth/pair-${sessionId}`;
    const { state } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
    });

    // Wait for open or QR event
    await waitForOpen(sock, 60000);

    // Ensure websocket is ready for sending
    const wsReady = await ensureWsReady(sock, 5000);
    if (!wsReady) {
      // If ws not ready, wait a bit more for 'open' state
      await waitForOpen(sock, 10000);
    }

    if (!sock.requestPairingCode) throw new Error("Pairing not supported");

    const code = await sock.requestPairingCode(cleanNumber);

    // Attempt graceful shutdown of temporary socket
    try {
      sock.ev.removeAllListeners();
      if (sock.ws && typeof sock.ws.close === "function") sock.ws.close();
    } catch (_) {
      // ignore
    }

    return code;
  } catch (err) {
    // Fallback: try using main connection builder (older behavior)
    try {
      const sock = await createBaileysConnection(sessionId, phoneNumber);
      await waitForOpen(sock, 15000);
      if (!sock.requestPairingCode) throw new Error("Pairing not supported");
      return await sock.requestPairingCode(cleanNumber);
    } catch (err2) {
      console.error(`❌ [${sessionId}] Pairing error:`, err2);
      throw err2;
    }
  }
}
