require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const { JSDOM } = require("jsdom");

const openai = require("./src/openai");

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

  // GPT prompt stuff here
  // Send HTML to OpenAI API with a careful prompt
  const prompt = `
    Given the following HTML page content, extract a list of events. 
    Each event should include at least: title, date, location (if available), and link (if available). 
   Return the result as a **valid JSON array** of this type (base on typescript type definition):
[
    {
        title: string,
        startDate: string // "2026-01-17",
        endDate?: string // only add if the event is over several days
        description: string 
        eventURL: string // the specific Url of the event if possible like 'https://nwhacks.io/specific-url' 
    },
    ...
]


    HTML:
    ${html}
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // 'gpt-4o' preferred for long inputs, fallback to 'gpt-3.5-turbo-16k' if you don’t have GPT-4 access
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    const parsedEvents = completion.choices[0].message.content;
    res.send(parsedEvents);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error parsing events with OpenAI");
  }
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
    "img",
  ];

  unwantedSelectors.forEach((selector) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => el.remove());
  });

  // Get the body content or fallback to documentElement
  const body = document.body || document.documentElement;
  return body.innerHTML;
}
