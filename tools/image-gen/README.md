# Nimi 生图台

本地网页 + 代理，调用 OpenAI Images API（默认 DALL·E 3）。

## 启动

```bash
cd tools/image-gen
node server.js
```

浏览器打开：http://127.0.0.1:8787

Key 写在同目录 `.env`（已 gitignore），格式：

```
OPENAI_API_KEY=sk-...
PORT=8787
```
