const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const { JSDOM } = require("jsdom");

const app = express();
const PORT = 3000;


app.get("/", (req, res) => {
  res.send("Hello from your Node.js server!");
});

// Example route to scrape events:
app.get("/scrape-events", async (req, res) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // only using 'domcontentloaded' to be safe, attempt to reduce later when crawling in bulk
  await page.goto("https://www.ubcbiztech.com/2024-2025/events-2024-2025", {
    waitUntil: "domcontentloaded",
  });
  const html = await page.content();

  const cleanedHTML = cleanHTML(html);
  const cleanedFilename = `page.html`;
  fs.writeFileSync(cleanedFilename, cleanedHTML, "utf8");
  console.log(`Cleaned HTML saved to ${cleanedFilename}`);

  await page.screenshot({ path: "page-loaded.png" });
  console.log("Screenshot saved as page-loaded.png");

  await browser.close();
  res.json({
    message: "Scraping completed",
    cleanedFile: cleanedFilename,
    screenshot: "page-loaded.png",
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});



// Function to clean HTML and keep only content
function cleanHTML(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
  
    // Remove unwanted elements
    const unwantedSelectors = [
      "head",
      "meta",
      "link",
      "style",
      "script",
      "noscript",
      "title",
      "img"
    ];
  
    unwantedSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    });
  
    // Get the body content or fallback to documentElement
    const body = document.body || document.documentElement;
    return body.innerHTML;
  }