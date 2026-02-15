const axios = require("axios");
const { chromium } = require("playwright");
const fs = require("fs");
const FormData = require("form-data");

/* ---------------- CONFIG ---------------- */
const BOT_TOKEN = "8379907917:AAF4-1IzfZP6G2sT83cZzhs7miYxsB_U3B0";
const CHAT_ID = "5786735330";

const VERCEL_API =
  "https://telegram-webhook-automation.vercel.app/api/webhook";

const DASHBOARD =
  "http://127.0.0.1:18789/#token=926a90e37d78ec45a3d251a2769d020f2af9e8ac5174c18d";


let browser, context, page;

/* ---------------- TELEGRAM ---------------- */

async function replyTelegram(text) {
  if (!text) text = "(empty reply)";

  const parts = String(text).match(/[\s\S]{1,3500}/g) || [];

  for (const p of parts) {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      { chat_id: CHAT_ID, text: p }
    );
  }
}

async function sendScreenshot(path) {
  const form = new FormData();
  form.append("chat_id", CHAT_ID);
  form.append("photo", fs.createReadStream(path));

  await axios.post(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
    form,
    { headers: form.getHeaders() }
  );
}

/* ---------------- PLAYWRIGHT ---------------- */

async function setupBrowser() {
  browser = await chromium.launch({ headless: false });

  context = await browser.newContext();
  page = await context.newPage();

  await page.goto(DASHBOARD);
  await page.waitForTimeout(4000);

  await page.goto(
    "http://127.0.0.1:18789/chat?session=agent%3Amain%3Amain"
  );

  console.log("OpenClaw ready");
}

/* ---------------- SEND TASK ---------------- */

async function sendTask(task) {
  const instruction = `
Use Playwright automation only.
Do NOT use relay or browser extension.

Task:
${task}
`;

  await page.click("textarea");
  await page.fill("textarea", instruction);
  await page.keyboard.press("Enter");

  // wait for OpenClaw to respond
  await page.waitForTimeout(10000);

  const messages = await page.$$eval(
    ".message",
    els => els.map(e => e.innerText)
  );

  const reply = messages.length
    ? messages[messages.length - 1]
    : "";

  return reply;
}

/* ---------------- TASK PIPELINE ---------------- */

async function runTask(task) {
  try {
    await replyTelegram(`📩 Task:\n${task}`);

    const reply = await sendTask(task);

    await replyTelegram("🧠 OpenClaw:\n" + reply);

    const file = `screen-${Date.now()}.png`;
    await page.screenshot({ path: file });

    await sendScreenshot(file);
    fs.unlinkSync(file);

    await replyTelegram("✅ Done");
  } catch (err) {
    console.log("Task error:", err);
    await replyTelegram("❌ Task failed: " + err.message);
  }
}

/* ---------------- LOOP ---------------- */

async function loop() {
  try {
    const res = await axios.get(VERCEL_API, { timeout: 15000 });
    const messages = res.data.items || [];

    if (!messages.length) return;

    for (const msg of messages) {
      await runTask(msg);
    }
  } catch (err) {
    console.log("Bridge error:", err.message);
  }
}

/* ---------------- START ---------------- */

(async () => {
  await setupBrowser();
  setInterval(loop, 5000);
  console.log("Telegram → OpenClaw bridge running...");
})();
