import puppeteer from "puppeteer";

const PAGE = process.env.JCI_PAGE || "http://127.0.0.1:5177/jci-bank-frames-demo#autosave";
const TIMEOUT_MS = Number(process.env.JCI_TIMEOUT_MS || 15 * 60 * 1000);
const executablePath =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const browser = await puppeteer.launch({
  headless: false,
  executablePath,
  protocolTimeout: TIMEOUT_MS,
  args: [
    "--use-gl=desktop",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--disable-web-security",
  ],
  defaultViewport: { width: 1280, height: 900 },
});

let ok = false;
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  page.on("console", (msg) => console.log("[page]", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.error("[pageerror]", err));

  console.log("open", PAGE);
  await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });

  await page.waitForFunction(() => window.__JCIReady === true, { timeout: TIMEOUT_MS });
  console.log("model ready, start export");
  // 不要 await 整段 bake（协议会超时），只点火后轮询状态。
  await page.evaluate(() => {
    void window.runAutoExport();
    return true;
  });

  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const state = await page.evaluate(() => ({
      title: document.title,
      done: !!window.__JCIExportDone,
      exporting: !!window.__JCIExporting,
      err: window.__JCIExportError || "",
      status: (document.getElementById("status") || {}).textContent || "",
    }));
    console.log("state", state);
    if (state.done || state.title === "JCI_EXPORT_DONE") {
      console.log("export ok");
      ok = true;
      break;
    }
    if (state.title === "JCI_EXPORT_FAIL" || state.err) {
      throw new Error(`export failed: ${state.err || state.title}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!ok) throw new Error("export timed out");
} finally {
  await browser.close();
}

if (!ok) process.exit(1);
