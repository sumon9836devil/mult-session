import fs from 'fs-extra';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { Readable, PassThrough } from 'stream';

/********************************************************************
 * ONLY STORE EXACTLY THESE FILES IN THE DATABASE
 ********************************************************************/
const SELECTED_PATTERNS = [
  'creds.json',
  'noise-key.json',
  'signed-pre-key-*.json',
  'pre-key-1.json'
];

/********************************************************************/
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
}

function matchPattern(name, pattern) {
  // normalize to forward slashes for consistent matching
  const normName = name.replace(/\\\\/g, '/');
  const normPattern = pattern.replace(/\\\\/g, '/');

  const hasSlash = normPattern.includes('/');

  // build a regex from the glob-like pattern (only supporting '*')
  const parts = normPattern.split('*').map(escapeRegExp);
  const re = new RegExp('^' + parts.join('.*') + '$');

  // first try full relative path match
  if (re.test(normName)) return true;

  // if pattern has no directory component, also try matching filename alone
  if (!hasSlash) {
    const base = path.posix.basename(normName);
    if (re.test(base)) return true;
  }

  return false;
}

/********************************************************************/
async function collectSelectedFilePaths(authDir) {
  const map = {};
  if (!(await fs.pathExists(authDir))) return map;

  async function walk(dir, base = '') {
    const items = await fs.readdir(dir);
    for (const it of items) {
      const abs = path.join(dir, it);
      const rel = base ? `${base}/${it}` : it;
      const stat = await fs.stat(abs);

      if (stat.isDirectory()) {
        await walk(abs, rel);
      } else {
        const ok = SELECTED_PATTERNS.some((p) => matchPattern(rel, p));
        if (!ok) continue;
        map[rel.replace(/\\/g, '/')] = abs;
      }
    }
  }

  await walk(authDir);
  return map;
}

/********************************************************************/
function gzipAndEncode(buf) {
  const gz = zlib.gzipSync(buf);
  return { gz, b64: gz.toString('base64') };
}

function sha256hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function atomicWriteFile(absPath, buf, mode = 0o600) {
  const dir = path.dirname(absPath);
  await fs.ensureDir(dir);

  const tmp = `${absPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tmp, buf, { mode });
  await fs.rename(tmp, absPath);

  try { await fs.chmod(absPath, mode); } catch (e) {}
}

/********************************************************************/
export async function persistSelectedFiles(sessionId, authDir, saveToDbFn, loadFromDbFn, opts = {}) {
  const attempts = opts.attempts ?? 5;
  const backoffBase = opts.backoffBase ?? 200;
  const maxBytes = opts.maxBytes ?? parseInt(process.env.AUTH_MAX_BYTES || `${600 * 1024}`, 10);

  const rawPaths = await collectSelectedFilePaths(authDir);

  if (Object.keys(rawPaths).length === 0) {
    const credsPath = path.join(authDir, 'creds.json');
    if (await fs.pathExists(credsPath)) {
      rawPaths['creds.json'] = credsPath;
    }
  }

  if (Object.keys(rawPaths).length === 0) {
    return { ok: false, reason: 'no_selected_files' };
  }

  const checksums = {};
  const encoded = {};
  let totalBytes = 0;

  // Helper: compute sha256 of file and gzip->base64 by streaming per-file
  async function processFileToGzB64(absPath) {
    return new Promise((resolve, reject) => {
      const rs = fs.createReadStream(absPath);
      const gzip = zlib.createGzip();
      const chunks = [];
      let gzLen = 0;
      const hash = crypto.createHash('sha256');

      rs.on('data', (c) => hash.update(c));
      rs.on('error', (e) => reject(e));
      gzip.on('error', (e) => reject(e));

      gzip.on('data', (chunk) => {
        chunks.push(chunk);
        gzLen += chunk.length;
      });

      gzip.on('end', () => {
        try {
          const gzBuf = Buffer.concat(chunks);
          const b64 = gzBuf.toString('base64');
          const checksum = hash.digest('hex');
          resolve({ checksum, gzLen, b64 });
        } catch (e) {
          reject(e);
        }
      });

      rs.pipe(gzip);
    });
  }

  for (const [rel, absPath] of Object.entries(rawPaths)) {
    const { checksum, gzLen, b64 } = await processFileToGzB64(absPath);
    checksums[rel] = checksum;
    encoded[rel] = b64;
    totalBytes += gzLen;
  }

  let finalMap = encoded;
  let finalTotal = totalBytes;

  if (finalTotal > maxBytes) {
    const small = {};

    // Prefer storing the smallest essential files when over maxBytes.
    // Include creds, noise-key, any signed-pre-key-*.json and pre-key-1.json
    for (const [rel, absPath] of Object.entries(rawPaths)) {
      const base = path.posix.basename(rel);
      if (
        base === 'creds.json' ||
        base === 'noise-key.json' ||
        base === 'pre-key-1.json' ||
        base.startsWith('signed-pre-key-')
      ) {
        small[rel] = absPath;
      }
    }

    const smallEncoded = {};
    let smallTotal = 0;

    for (const [rel, absPath] of Object.entries(small)) {
      const { checksum, gzLen, b64 } = await processFileToGzB64(absPath);
      // ensure checksums map stays consistent with chosen small set
      smallEncoded[rel] = b64;
      smallTotal += gzLen;
      checksums[rel] = checksum;
    }

    if (smallTotal <= maxBytes && Object.keys(smallEncoded).length > 0) {
      finalMap = smallEncoded;
      finalTotal = smallTotal;

      for (const k of Object.keys(checksums))
        if (!small[k]) delete checksums[k];
    } else {
      if (rawPaths['creds.json']) {
        const { checksum, gzLen, b64 } = await processFileToGzB64(rawPaths['creds.json']);
        finalMap = { 'creds.json': b64 };
        finalTotal = gzLen;

        for (const k of Object.keys(checksums)) {
          if (k !== 'creds.json') delete checksums[k];
        }
        checksums['creds.json'] = checksum;
      }
    }
  }

  const payload = {
    _selected_files: finalMap,
    _selected_meta: {
      checksums,
      totalBytes: finalTotal,
      ts: Date.now(),
    },
  };

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await saveToDbFn(sessionId, payload);

      const loaded = await loadFromDbFn(sessionId);
      if (!loaded) throw new Error('load_returned_null');

      const loadedCreds = loaded.creds ?? loaded;
      const sel = loadedCreds?._selected_files ?? loaded?._selected_files ?? null;
      const meta = loadedCreds?._selected_meta ?? loaded?._selected_meta ?? null;

      if (!sel || !meta || !meta.checksums)
        throw new Error('no_selected_files_in_db');

      // Streaming verification to avoid large memory spikes
      async function verifyGzippedBase64AgainstHex(b64, expectedHex) {
        return new Promise((resolve, reject) => {
          const gunzip = zlib.createGunzip();
          const hash = crypto.createHash('sha256');

          // stream decoded base64 in chunks aligned to 4 chars
          const CHUNK_CHARS = 64 * 1024;
          const chunkSize = Math.max(4, CHUNK_CHARS - (CHUNK_CHARS % 4));
          let idx = 0;

          const r = new Readable({
            read() {
              if (idx >= b64.length) { this.push(null); return; }
              const end = Math.min(idx + chunkSize, b64.length);
              const slice = b64.slice(idx, end);
              idx = end;
              try {
                const buf = Buffer.from(slice, 'base64');
                this.push(buf);
              } catch (e) { this.destroy(e); }
            }
          });

          r.on('error', (e) => reject(e));
          gunzip.on('error', (e) => reject(e));

          gunzip.on('data', (chunk) => hash.update(chunk));
          gunzip.on('end', () => {
            try {
              const got = hash.digest('hex');
              resolve(got === expectedHex);
            } catch (e) { reject(e); }
          });

          r.pipe(gunzip);
        });
      }

      for (const [rel, expectedHex] of Object.entries(meta.checksums)) {
        const b64 = sel[rel];
        if (!b64) throw new Error('missing_file_in_db');
        const match = await verifyGzippedBase64AgainstHex(b64, expectedHex);
        if (!match) throw new Error('checksum_mismatch');
      }

      return { ok: true };

    } catch (err) {
      if (attempt + 1 >= attempts)
        return { ok: false, reason: err?.message || String(err) };

      const delay = backoffBase * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return { ok: false, reason: 'unknown' };
}

/********************************************************************/
export async function restoreSelectedFiles(sessionId, authDir, loadFromDbFn) {
  try {
    const loaded = await loadFromDbFn(sessionId);
    if (!loaded) return { ok: false, reason: 'no_db_row' };

    const loadedCreds = loaded.creds ?? loaded;
    const sel = loadedCreds?._selected_files ?? loaded?._selected_files ?? null;
    const meta = loadedCreds?._selected_meta ?? loaded?._selected_meta ?? null;

    if (!sel || !meta || !meta.checksums)
      return { ok: false, reason: 'no_selected_files_in_db' };

    // Helper: write a gzipped base64 string to disk by streaming decode + gunzip
    async function writeGzippedBase64ToFile(abs, b64, mode = 0o600) {
      await fs.ensureDir(path.dirname(abs));
      const tmp = `${abs}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      return new Promise((resolve, reject) => {
        const gunzip = zlib.createGunzip();
        const pass = new PassThrough();
        const ws = fs.createWriteStream(tmp, { mode });
        const hash = crypto.createHash('sha256');

        // decode base64 in chunks aligned to 4 chars to avoid large temporary buffers
        const CHUNK_CHARS = 64 * 1024; // chars per chunk
        const chunkSize = Math.max(4, CHUNK_CHARS - (CHUNK_CHARS % 4));
        let idx = 0;
        const r = new Readable({
          read() {
            if (idx >= b64.length) {
              this.push(null);
              return;
            }
            const end = Math.min(idx + chunkSize, b64.length);
            const slice = b64.slice(idx, end);
            idx = end;
            try {
              const buf = Buffer.from(slice, 'base64');
              this.push(buf);
            } catch (err) {
              this.destroy(err);
            }
          }
        });

        r.on('error', (e) => reject(e));
        gunzip.on('error', (e) => reject(e));
        ws.on('error', (e) => reject(e));

        pass.on('data', (chunk) => hash.update(chunk));

        ws.on('finish', async () => {
          try {
            const got = hash.digest('hex');
            await fs.rename(tmp, abs);
            try { await fs.chmod(abs, mode); } catch (e) {}
            resolve(got);
          } catch (e) {
            reject(e);
          }
        });

        // pipeline: base64-decoder(readable) -> gunzip -> passThrough -> writeStream
        r.pipe(gunzip).pipe(pass).pipe(ws);
      });
    }

    for (const [rel, b64] of Object.entries(sel)) {
      try {
        const abs = path.join(authDir, rel);
        const gotHex = await writeGzippedBase64ToFile(abs, b64, 0o600);
        const expect = meta.checksums[rel];
        if (!expect || gotHex !== expect)
          return { ok: false, reason: `checksum_mismatch:${rel}` };
      } catch (err) {
        return {
          ok: false,
          reason: `write_failed:${rel}:${err?.message || err}`
        };
      }
    }

    return { ok: true };

  } catch (err) {
    return { ok: false, reason: err?.message || String(err) };
  }
}

export default {
  persistSelectedFiles,
  restoreSelectedFiles,
};