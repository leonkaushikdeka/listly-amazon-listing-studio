#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const tutorialRoot = path.join(projectRoot, "docs", "tutorial");
const screenshotsRoot = path.join(tutorialRoot, "screenshots");
const examplesRoot = path.join(tutorialRoot, "examples");
const demoTemplate = path.join(examplesRoot, "demo-apparel-amazon-template.xlsx");
const filledWorkbook = path.join(examplesRoot, "demo-apparel-amazon-template-filled.xlsx");
const videoOutput = path.join(tutorialRoot, "listly-amazon-workbook-walkthrough.webm");
const recordingsRoot = path.join(tutorialRoot, ".recordings");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function pause(milliseconds) {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}

function startStaticServer(root) {
  const server = http.createServer(function (request, response) {
    const requestPath = decodeURIComponent(((request.url || "/").split("?")[0]) || "/");
    const requested = requestPath === "/" ? "index.html" : requestPath.replace(/^[/\\]+/, "");
    const absolutePath = path.resolve(root, requested);
    const relative = path.relative(root, absolutePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.stat(absolutePath, function (error, stats) {
      if (error || !stats.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(absolutePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      fs.createReadStream(absolutePath).pipe(response);
    });
  });

  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () {
      const address = server.address();
      resolve({
        server: server,
        baseUrl: "http://127.0.0.1:" + address.port
      });
    });
  });
}

async function installTutorialUi(page) {
  await page.addStyleTag({
    content: [
      "#tutorial-cue { position: fixed; right: 24px; bottom: 24px; z-index: 9999; width: min(420px, calc(100vw - 48px)); padding: 18px 20px; border: 1px solid rgba(255,255,255,.22); border-radius: 16px; background: rgba(17, 25, 40, .94); color: #fff; box-shadow: 0 18px 50px rgba(0,0,0,.35); font-family: Inter, Arial, sans-serif; }",
      "#tutorial-cue .tutorial-step { display: block; margin-bottom: 5px; color: #8ee0c0; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }",
      "#tutorial-cue strong { display: block; margin-bottom: 5px; font-size: 19px; line-height: 1.2; }",
      "#tutorial-cue p { margin: 0; color: rgba(255,255,255,.82); font-size: 14px; line-height: 1.4; }",
      "#tutorial-highlight { position: fixed; z-index: 9998; border: 3px solid #63e6be; border-radius: 11px; box-shadow: 0 0 0 9999px rgba(12, 20, 33, .08), 0 0 0 6px rgba(99,230,190,.22); pointer-events: none; transition: all .2s ease; }",
      "#tutorial-end-card { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 48px; background: rgba(12,20,33,.94); color: #fff; font-family: Inter, Arial, sans-serif; text-align: center; }",
      "#tutorial-end-card .tutorial-end-inner { max-width: 720px; }",
      "#tutorial-end-card span { display: block; margin-bottom: 12px; color: #8ee0c0; font-size: 13px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }",
      "#tutorial-end-card h1 { margin: 0 0 18px; font-size: 48px; line-height: 1.06; }",
      "#tutorial-end-card p { margin: 0 auto; max-width: 610px; color: rgba(255,255,255,.82); font-size: 21px; line-height: 1.45; }"
    ].join("\n")
  });

  await page.evaluate(function () {
    const cue = document.createElement("aside");
    cue.id = "tutorial-cue";
    cue.innerHTML = '<span class="tutorial-step"></span><strong></strong><p></p>';
    document.body.appendChild(cue);

    const highlight = document.createElement("div");
    highlight.id = "tutorial-highlight";
    highlight.hidden = true;
    document.body.appendChild(highlight);
  });
}

async function cue(page, step, title, body) {
  await page.evaluate(function (data) {
    const box = document.getElementById("tutorial-cue");
    box.querySelector(".tutorial-step").textContent = data.step;
    box.querySelector("strong").textContent = data.title;
    box.querySelector("p").textContent = data.body;
  }, { step: step, title: title, body: body });
}

async function highlight(page, selector) {
  const locator = page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Could not highlight " + selector);

  await page.evaluate(function (position) {
    const element = document.getElementById("tutorial-highlight");
    element.hidden = false;
    element.style.left = Math.max(6, position.x - 7) + "px";
    element.style.top = Math.max(6, position.y - 7) + "px";
    element.style.width = position.width + 14 + "px";
    element.style.height = position.height + 14 + "px";
  }, box);
}

async function clearHighlight(page) {
  await page.evaluate(function () {
    document.getElementById("tutorial-highlight").hidden = true;
  });
}

async function screenshot(page, name) {
  await page.screenshot({
    path: path.join(screenshotsRoot, name),
    animations: "disabled"
  });
}

async function showEndCard(page) {
  await page.evaluate(function () {
    const card = document.createElement("section");
    card.id = "tutorial-end-card";
    card.innerHTML = '<div class="tutorial-end-inner"><span>Finish in Seller Central</span><h1>Upload the filled workbook, then review Amazon&apos;s processing report.</h1><p>Use the real blank template for your marketplace, category, and product type. The demo file shown here is synthetic and must not be uploaded to Seller Central.</p></div>';
    document.body.appendChild(card);
  });
}

async function recordTutorial() {
  if (!fs.existsSync(demoTemplate)) {
    throw new Error("Demo template is missing. Run npm run tutorial:fixture first.");
  }

  fs.mkdirSync(screenshotsRoot, { recursive: true });
  fs.mkdirSync(examplesRoot, { recursive: true });
  fs.mkdirSync(tutorialRoot, { recursive: true });
  fs.rmSync(recordingsRoot, { recursive: true, force: true });
  fs.mkdirSync(recordingsRoot, { recursive: true });

  const serverInfo = await startStaticServer(projectRoot);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const smokeContext = await browser.newContext({
      colorScheme: "light",
      viewport: { width: 390, height: 844 }
    });
    await smokeContext.addInitScript(function () {
      window.localStorage.clear();
    });
    const smokePage = await smokeContext.newPage();
    await smokePage.goto(serverInfo.baseUrl + "/index.html", { waitUntil: "networkidle" });
    await smokePage.locator("#tutorialBtn").click();
    await smokePage.waitForFunction(function () {
      return !document.getElementById("tutorialTour").hidden;
    });
    await smokePage.locator("#tutorialNextBtn").click();
    await smokePage.waitForFunction(function () {
      return document.getElementById("tutorialProgress").textContent === "STEP 2 OF 11";
    });
    if (!(await smokePage.locator("#tutorialPrevBtn").isVisible())) {
      throw new Error("Tutorial previous control is hidden on mobile.");
    }
    await smokePage.locator("#tutorialClose").click();
    await smokePage.waitForFunction(function () {
      return document.getElementById("tutorialTour").hidden;
    });
    await smokeContext.close();

    const context = await browser.newContext({
      acceptDownloads: true,
      colorScheme: "light",
      viewport: { width: 1440, height: 960 },
      recordVideo: {
        dir: recordingsRoot,
        size: { width: 960, height: 640 }
      }
    });
    await context.addInitScript(function () {
      window.localStorage.clear();
    });

    const page = await context.newPage();
    await page.goto(serverInfo.baseUrl + "/index.html", { waitUntil: "networkidle" });
    await page.evaluate(function () {
      window.scrollTo(0, 0);
    });
    await installTutorialUi(page);

    await cue(
      page,
      "Listly walkthrough",
      "Create an Amazon upload workbook from one product draft",
      "This example uses a fictional apparel variation family and a synthetic Amazon-style template."
    );
    await pause(2800);

    await cue(
      page,
      "Before you start",
      "Download the correct blank workbook in Seller Central",
      "Catalog > Add Products > Spreadsheet > Download blank template. Choose the marketplace, category, and product type that match your real item."
    );
    await pause(3600);

    await cue(
      page,
      "1 of 5 - Product details",
      "Enter shared listing information once",
      "Listly reuses the title, bullets, description, and brand for every variation child."
    );
    await highlight(page, "#productName");
    await page.locator("#category").selectOption({ label: "Clothing & Accessories" });
    await page.locator("#productName").fill("Organic Cotton Crew Neck T-Shirt");
    await page.locator("#brand").fill("Northpeak Demo");
    await page.locator("#model").fill("Everyday Crew");
    await page.locator("#productIdType").selectOption("GTIN_EXEMPT");
    await page.locator("#features").fill(
      "Soft organic cotton jersey\nClassic crew neck for everyday wear\nTag-free neckline\nEasy-care machine washable fabric"
    );
    await page.locator("#audience").fill("adults building a versatile everyday wardrobe");
    await page.locator("#keywordInput").fill("organic cotton t shirt");
    await page.locator("#keywordInput").press("Enter");
    await page.locator("#keywordInput").fill("crew neck tee");
    await page.locator("#keywordInput").press("Enter");
    await page.locator("#keywordInput").fill("everyday basics");
    await page.locator("#keywordInput").press("Enter");
    await pause(1300);

    await cue(
      page,
      "2 of 5 - Variation family",
      "Create the parent and its child sizes",
      "This demo uses an approved GTIN exemption. Use real, valid product IDs for each child unless your seller account is exempt."
    );
    await highlight(page, "#variationsEnabled");
    await page.locator("#variationsEnabled").check();
    await pause(500);
    await page.locator("#parentSku").fill("NP-DEMO-TEE-PARENT");
    await page.locator("#bulkSkuPrefix").fill("NP-DEMO-TEE");
    await page.locator("#bulkPrice").fill("24.99");
    await page.locator("#bulkStock").fill("12");
    await highlight(page, "#createSizesBtn");
    await page.locator("#createSizesBtn").click();
    await pause(1300);
    await clearHighlight(page);

    await cue(
      page,
      "3 of 5 - Generate",
      "Create and review the listing copy",
      "The title, bullets, description, and variation records remain editable before workbook generation."
    );
    await highlight(page, ".generate-btn");
    await page.locator(".generate-btn").click();
    await page.locator("#listingOutput").waitFor({ state: "visible" });
    await pause(1400);
    await screenshot(page, "01-listing-generated.png");
    await clearHighlight(page);

    await cue(
      page,
      "4 of 5 - Choose the blank template",
      "Listly detects Amazon-style listing headers locally",
      "The mapping report identifies the sheet and header row, then warns about critical columns it cannot map."
    );
    await highlight(page, "#templateDrop");
    await page.locator("#amazonTemplateFile").setInputFiles(demoTemplate);
    await page.waitForFunction(function () {
      return document.getElementById("templateStatus").textContent.includes("ready to fill");
    });
    await pause(1800);
    await screenshot(page, "02-template-recognized.png");
    await clearHighlight(page);

    await cue(
      page,
      "5 of 5 - Fill and download",
      "Create the completed workbook",
      "The demo creates one parent record and four buyable size children in the detected Template sheet."
    );
    await highlight(page, "#fillTemplateBtn");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#fillTemplateBtn").click();
    const download = await downloadPromise;
    await download.saveAs(filledWorkbook);
    await page.waitForFunction(function () {
      return document.getElementById("templateStatus").textContent.includes("listing rows added");
    });
    await pause(1800);
    await screenshot(page, "03-workbook-downloaded.png");
    await clearHighlight(page);

    await showEndCard(page);
    await pause(4600);

    const video = page.video();
    await context.close();
    await video.saveAs(videoOutput);
    fs.rmSync(recordingsRoot, { recursive: true, force: true });
    await browser.close();
    browser = null;

    process.stdout.write("Recorded tutorial video: " + path.relative(projectRoot, videoOutput) + "\n");
    process.stdout.write("Saved filled demo workbook: " + path.relative(projectRoot, filledWorkbook) + "\n");
  } finally {
    fs.rmSync(recordingsRoot, { recursive: true, force: true });
    if (browser) await browser.close();
    await new Promise(function (resolve) {
      serverInfo.server.close(resolve);
    });
  }
}

recordTutorial().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
