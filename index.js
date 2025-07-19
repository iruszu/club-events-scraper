require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const { JSDOM } = require("jsdom");

const openai = require("./src/openai");
const { addEventsToOpportunities } = require("./src/firebase");

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
  const clubID = "temp-biz-tech";
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
    Return the result as an immediately **parsable JSON array** of this type (base on typescript type definition):
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

    Here is the HTML to parse:
    ${html}
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // 'gpt-4o' preferred for long inputs, fallback to 'gpt-3.5-turbo-16k' if you don’t have GPT-4 access
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    const rawResponse = completion.choices[0].message.content;
    const eventsString = extractFromCodeBlock(rawResponse);

    // we don't need to store the clubId here
    const eventsJson = JSON.parse(eventsString).map((e) => {
      // object deconstruction, and adding a field of the same name as the var
      return { ...e, clubID };
    });
    console.log("is data parsable?", eventsJson);

    // Save events to Firestore using helper function
    try {
      await addEventsToOpportunities(clubID, eventsJson);
    } catch (firestoreError) {
      console.error("Error saving to Firestore:", firestoreError);
    }

    res.send(eventsJson);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error parsing events with OpenAI");
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Function to extract content from code blocks if present, otherwise return original
function extractFromCodeBlock(text) {
  // Look for triple backticks with optional language identifier
  const codeBlockRegex = /```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?```/;
  const match = text.match(codeBlockRegex);

  if (match) {
    return match[1].trim();
  }

  // If no code block found, return the original text
  return text.trim();
}

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
