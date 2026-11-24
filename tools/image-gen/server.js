/**
 * 本地 OpenAI 生图代理。
 * 本机 Node TLS 经代理经常握手失败，出站统一走 curl.exe -x（实测稳定）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function readWindowsProxy() {
  if (process.platform !== 'win32') return null;
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable & reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
      { encoding: 'utf8', windowsHide: true }
    );
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(out)) return null;
    const m = out.match(/ProxyServer\s+REG_SZ\s+(\S+)/i);
    if (!m) return null;
    let raw = m[1].trim();
    const httpsPart = raw.match(/(?:https|http)=([^;]+)/i);
    if (httpsPart) raw = httpsPart[1];
    if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
    return raw;
  } catch {
    return null;
  }
}

loadEnv();

const PORT = Number(process.env.PORT || 8787);
const DEFAULT_KEY = (process.env.OPENAI_API_KEY || '').trim();
const OPENAI_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
const PROXY_URL = (
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.ALL_PROXY ||
  process.env.PROXY ||
  readWindowsProxy() ||
  ''
).trim();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': headers['Content-Type'] || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 30 * 1024 * 1024) {
        req.destroy();
        reject(new Error('上传内容超过 30MB'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function findCurl() {
  const candidates = process.platform === 'win32'
    ? ['curl.exe', 'C:\\Windows\\System32\\curl.exe']
    : ['curl'];
  for (const c of candidates) {
    try {
      const { execFileSync } = require('child_process');
      execFileSync(c, ['--version'], { stdio: 'ignore', windowsHide: true });
      return c;
    } catch (_) {}
  }
  return null;
}

const CURL = findCurl();

/**
 * 用 curl 发 HTTPS；body 写临时文件，避免命令行过长/泄露到日志。
 * 返回 { status, buffer }
 */
function curlRequest({ method, url, headers = {}, bodyBuf = null, timeoutSec = 180, binary = false }) {
  if (!CURL) {
    return Promise.reject(new Error('未找到 curl.exe，无法走稳定代理通道'));
  }

  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimi-img-'));
    const outFile = path.join(tmpDir, binary ? 'out.bin' : 'out.json');
    const hdrFile = path.join(tmpDir, 'hdr.txt');
    let bodyFile = null;

    const args = [
      '-sS',
      '-X', method,
      '--max-time', String(timeoutSec),
      '--connect-timeout', '30',
      '-D', hdrFile,
      '-o', outFile,
      '--http1.1',
    ];
    if (PROXY_URL) {
      args.push('-x', PROXY_URL);
    }
    for (const [k, v] of Object.entries(headers)) {
      if (v == null || v === '') continue;
      args.push('-H', `${k}: ${v}`);
    }
    if (bodyBuf && bodyBuf.length) {
      bodyFile = path.join(tmpDir, 'body.json');
      fs.writeFileSync(bodyFile, bodyBuf);
      args.push('--data-binary', `@${bodyFile}`);
    }
    args.push(url);

    const child = spawn(CURL, args, { windowsHide: true });
    let errBuf = '';
    child.stderr.on('data', (d) => {
      errBuf += d.toString('utf8');
    });
    child.on('error', (err) => {
      cleanup();
      reject(err);
    });
    child.on('close', (code) => {
      try {
        if (code !== 0) {
          cleanup();
          reject(new Error((errBuf || `curl exit ${code}`).trim()));
          return;
        }
        const hdrText = fs.existsSync(hdrFile) ? fs.readFileSync(hdrFile, 'utf8') : '';
        // 可能有代理 200 Connection established 后再跟真实响应头
        const blocks = hdrText.split(/\r?\n\r?\n/).filter((b) => /HTTP\/\d/i.test(b));
        const last = blocks[blocks.length - 1] || '';
        const status = Number((last.match(/HTTP\/\d(?:\.\d)?\s+(\d+)/i) || [])[1] || 0);
        const buffer = fs.existsSync(outFile) ? fs.readFileSync(outFile) : Buffer.alloc(0);
        cleanup();
        if (!status) {
          reject(new Error(`无效 HTTP 响应（收到 ${buffer.length} 字节）${errBuf ? ' ' + errBuf.trim() : ''}`));
          return;
        }
        resolve({ status, buffer });
      } catch (e) {
        cleanup();
        reject(e);
      }
    });

    function cleanup() {
      try {
        for (const f of [outFile, hdrFile, bodyFile]) {
          if (f && fs.existsSync(f)) fs.unlinkSync(f);
        }
        fs.rmdirSync(tmpDir);
      } catch (_) {}
    }
  });
}

async function curlRequestRetry(opts, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await curlRequest(opts);
    } catch (err) {
      lastErr = err;
      const msg = String(err.message || err);
      const retryable = /TLS|disconnect|reset|timeout|Empty reply|Failed to connect|proxy|curl/i.test(msg);
      console.warn(`[curl retry ${i}/${attempts}] ${msg}`);
      if (!retryable || i >= attempts) throw err;
      await sleep(700 * i);
    }
  }
  throw lastErr;
}

async function openaiPost(apiPath, apiKey, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const url = `${OPENAI_BASE}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
  const res = await curlRequestRetry({
    method: 'POST',
    url,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    bodyBuf: body,
    timeoutSec: 180,
  });
  const text = res.buffer.toString('utf8');
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function openaiEditOnce(apiKey, payload, imageBuffer, imageMime) {
  if (!CURL) {
    return Promise.reject(new Error('未找到 curl.exe，无法走稳定代理通道'));
  }

  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimi-edit-'));
    const ext = imageMime === 'image/jpeg' ? '.jpg' : imageMime === 'image/webp' ? '.webp' : '.png';
    const imageFile = path.join(tmpDir, `reference${ext}`);
    const outFile = path.join(tmpDir, 'out.json');
    const hdrFile = path.join(tmpDir, 'hdr.txt');
    fs.writeFileSync(imageFile, imageBuffer);

    const args = [
      '-sS',
      '-X', 'POST',
      '--max-time', '240',
      '--connect-timeout', '30',
      '-D', hdrFile,
      '-o', outFile,
      '--http1.1',
    ];
    if (PROXY_URL) args.push('-x', PROXY_URL);
    args.push(
      '-H', `Authorization: Bearer ${apiKey}`,
      '-F', `image=@${imageFile};type=${imageMime}`,
      '-F', `prompt=${payload.prompt}`,
      '-F', `model=${payload.model}`,
      '-F', `size=${payload.size}`
    );
    if (payload.quality && payload.quality !== 'auto') {
      args.push('-F', `quality=${payload.quality}`);
    }
    args.push(`${OPENAI_BASE}/v1/images/edits`);

    const child = spawn(CURL, args, { windowsHide: true });
    let errBuf = '';
    child.stderr.on('data', (d) => {
      errBuf += d.toString('utf8');
    });
    child.on('error', (err) => {
      cleanup();
      reject(err);
    });
    child.on('close', (code) => {
      try {
        if (code !== 0) {
          cleanup();
          reject(new Error((errBuf || `curl exit ${code}`).trim()));
          return;
        }
        const hdrText = fs.existsSync(hdrFile) ? fs.readFileSync(hdrFile, 'utf8') : '';
        const blocks = hdrText.split(/\r?\n\r?\n/).filter((b) => /HTTP\/\d/i.test(b));
        const last = blocks[blocks.length - 1] || '';
        const status = Number((last.match(/HTTP\/\d(?:\.\d)?\s+(\d+)/i) || [])[1] || 0);
        const buffer = fs.existsSync(outFile) ? fs.readFileSync(outFile) : Buffer.alloc(0);
        cleanup();
        if (!status) {
          reject(new Error(`无效 HTTP 响应（收到 ${buffer.length} 字节）`));
          return;
        }
        let json;
        try {
          json = JSON.parse(buffer.toString('utf8'));
        } catch {
          json = { raw: buffer.toString('utf8') };
        }
        resolve({ status, json });
      } catch (e) {
        cleanup();
        reject(e);
      }
    });

    function cleanup() {
      try {
        for (const f of [imageFile, outFile, hdrFile]) {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        }
        fs.rmdirSync(tmpDir);
      } catch (_) {}
    }
  });
}

async function openaiEdit(apiKey, payload, imageBuffer, imageMime) {
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      return await openaiEditOnce(apiKey, payload, imageBuffer, imageMime);
    } catch (err) {
      lastErr = err;
      const msg = String(err.message || err);
      const retryable = /TLS|disconnect|reset|timeout|Empty reply|Failed to connect|proxy|curl/i.test(msg);
      console.warn(`[edit retry ${i}/3] ${msg}`);
      if (!retryable || i >= 3) throw err;
      await sleep(700 * i);
    }
  }
  throw lastErr;
}

async function fetchUrlAsB64(fileUrl) {
  const res = await curlRequestRetry({
    method: 'GET',
    url: fileUrl,
    timeoutSec: 120,
    binary: true,
  });
  if (res.status >= 400) throw new Error(`下载生成图失败 HTTP ${res.status}`);
  return res.buffer.toString('base64');
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC, urlPath));
  if (!file.startsWith(PUBLIC)) {
    send(res, 403, { error: 'forbidden' });
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    send(res, 404, { error: 'not found' });
    return;
  }
  const ext = path.extname(file).toLowerCase();
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[ext] || 'application/octet-stream' });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      send(res, 200, {
        ok: true,
        hasKey: Boolean(DEFAULT_KEY),
        keyHint: DEFAULT_KEY ? `${DEFAULT_KEY.slice(0, 7)}…${DEFAULT_KEY.slice(-4)}` : null,
        proxy: PROXY_URL || null,
        openaiHost: OPENAI_BASE,
        transport: CURL ? `curl (${CURL})` : null,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/generate') {
      const raw = await readBody(req);
      let data;
      try {
        data = JSON.parse(raw.toString('utf8') || '{}');
      } catch {
        send(res, 400, { error: 'JSON 无效' });
        return;
      }

      const prompt = String(data.prompt || '').trim();
      if (!prompt) {
        send(res, 400, { error: '请填写提示词' });
        return;
      }

      const apiKey = String(data.apiKey || DEFAULT_KEY || '').trim();
      if (!apiKey) {
        send(res, 400, { error: '缺少 API Key（检查 .env 或页面输入）' });
        return;
      }

      if (!PROXY_URL) {
        send(res, 500, {
          error: '未检测到代理。请打开系统代理，或在 .env 设置 HTTPS_PROXY=http://127.0.0.1:端口',
        });
        return;
      }

      const model = String(data.model || 'gpt-image-1-mini');
      const size = String(data.size || '1024x1024');
      const quality = String(data.quality || 'auto');

      const payload = { model, prompt, size };
      if (quality && quality !== 'auto') payload.quality = quality;

      let result;
      if (data.imageBase64) {
        const imageMime = String(data.imageMime || 'image/png').toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(imageMime)) {
          send(res, 400, { error: '参考图仅支持 PNG、JPG、WebP' });
          return;
        }
        let imageBuffer;
        try {
          imageBuffer = Buffer.from(String(data.imageBase64), 'base64');
        } catch {
          send(res, 400, { error: '参考图数据无效' });
          return;
        }
        if (!imageBuffer.length || imageBuffer.length > 20 * 1024 * 1024) {
          send(res, 400, { error: '参考图必须小于 20MB' });
          return;
        }
        result = await openaiEdit(apiKey, payload, imageBuffer, imageMime);
      } else {
        result = await openaiPost('/v1/images/generations', apiKey, payload);
      }
      if (result.status >= 400) {
        const msg =
          result.json?.error?.message ||
          result.json?.message ||
          `OpenAI HTTP ${result.status}`;
        send(res, result.status, { error: msg, detail: result.json });
        return;
      }

      const item = result.json?.data?.[0] || {};
      let b64 = item.b64_json || item.b64 || null;
      const imageUrl = item.url || null;
      if (!b64 && !imageUrl) {
        send(res, 502, { error: '未返回图片数据', detail: result.json });
        return;
      }

      if (!b64 && imageUrl) {
        try {
          b64 = await fetchUrlAsB64(imageUrl);
        } catch (e) {
          send(res, 200, {
            b64: null,
            url: imageUrl,
            revised_prompt: item.revised_prompt || null,
            model,
            size,
            warn: e.message,
          });
          return;
        }
      }

      send(res, 200, {
        b64,
        url: imageUrl,
        revised_prompt: item.revised_prompt || null,
        model,
        size,
        mode: data.imageBase64 ? 'edit' : 'generate',
      });
      return;
    }

    if (req.method === 'GET') {
      serveStatic(req, res);
      return;
    }

    send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    const msg = err.message || String(err);
    send(res, 500, {
      error: /TLS|disconnect|proxy|curl|Failed to connect/i.test(msg)
        ? `${msg} —— 请确认代理软件在线（当前 ${PROXY_URL || '无'}）后重试`
        : msg,
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Image gen ready: http://127.0.0.1:${PORT}`);
  console.log(DEFAULT_KEY ? `Key loaded (${DEFAULT_KEY.slice(0, 7)}…)` : 'WARNING: no OPENAI_API_KEY in .env');
  console.log(PROXY_URL ? `Proxy: ${PROXY_URL}` : 'Proxy: NONE');
  console.log(CURL ? `Transport: ${CURL}` : 'Transport: MISSING curl');
});
