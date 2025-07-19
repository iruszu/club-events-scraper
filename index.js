require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const { JSDOM } = require("jsdom");

const openai = require("./src/openai");
const { addEventsToOpportunities, getClubs } = require("./src/firebase");

const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
  res.send("Hello from your Node.js server!");
});

// Example route to scrape events:
app.get("/scrape-events", async (req, res) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
    const allClubs = await getClubs();
    console.log(`Fetched ${allClubs.length} clubs`);

    const allEvents = [];

    // Process each club
    for (const club of allClubs) {
      const clubID = club.id;
      const urls = club.urls || club.URLS || [];

      if (!urls || urls.length === 0) {
        console.log(`No URLs found for club: ${clubID}`);
        continue;
      }

      console.log(`Processing ${urls.length} URLs for club: ${clubID}`);

      // Process each URL for this club
      for (const url of urls) {
        try {
          console.log(`Fetching: ${url}`);

          // Check if this is a Linktree URL
          if (isLinktreeUrl(url)) {
            console.log(`Processing Linktree URL: ${url}`);
            const linktreeUrls = await extractLinktreeUrls(page, url);
            console.log(`Found ${linktreeUrls.length} links in Linktree`);

            // Process each extracted URL from Linktree
            for (const linktreeUrl of linktreeUrls) {
              try {
                console.log(
                  `Processing Linktree extracted URL: ${linktreeUrl}`
                );
                const events = await processUrl(page, linktreeUrl, clubID);
                allEvents.push(...events);
              } catch (linkError) {
                console.error(
                  `Error processing Linktree link ${linktreeUrl}:`,
                  linkError.message
                );
                continue;
              }
            }
          } else {
            // Process regular URL
            const events = await processUrl(page, url, clubID);
            allEvents.push(...events);
          }
        } catch (urlError) {
          console.error(
            `Error processing URL ${url} for club ${clubID}:`,
            urlError.message
          );
          continue;
        }
      }
    }

    await browser.close();

    console.log(`Total events found: ${allEvents.length}`);

    // Group events by club and save to Firestore
    const eventsByClub = allEvents.reduce((acc, event) => {
      if (!acc[event.clubID]) {
        acc[event.clubID] = [];
      }
      acc[event.clubID].push(event);
      return acc;
    }, {});

    // Save events for each club
    for (const [clubID, events] of Object.entries(eventsByClub)) {
      try {
        await addEventsToOpportunities(clubID, events);
        console.log(`Saved ${events.length} events for club: ${clubID}`);
      } catch (firestoreError) {
        console.error(
          `Error saving events for club ${clubID}:`,
          firestoreError
        );
      }
    }

    res.json({
      success: true,
      totalEvents: allEvents.length,
      clubsProcessed: Object.keys(eventsByClub).length,
      eventsByClub: Object.fromEntries(
        Object.entries(eventsByClub).map(([clubID, events]) => [
          clubID,
          events.length,
        ])
      ),
    });
  } catch (err) {
    await browser.close();
    console.error("Error in scrape-events:", err);
    res.status(500).json({
      success: false,
      error: "Error scraping events",
      message: err.message,
    });
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
    "svg",
    "iframe",
    "video",
    "audio",
    "canvas",
    "nav",
    "footer",
    "header",
    "[class*='nav']",
    "[class*='menu']",
    "[class*='footer']",
    "[class*='header']",
    "[class*='sidebar']",
    "[class*='cookie']",
    "[class*='popup']",
    "[class*='modal']",
  ];

  unwantedSelectors.forEach((selector) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => el.remove());
  });

  // Get the body content or fallback to documentElement
  const body = document.body || document.documentElement;
  let content = body.textContent || body.innerText || "";

  // Clean up whitespace and limit content length
  content = content
    .replace(/\s+/g, " ") // Replace multiple whitespace with single space
    .replace(/\n+/g, "\n") // Replace multiple newlines with single newline
    .trim();

  // Limit content to approximately 12000 characters to stay well under token limit
  // (roughly 3000-4000 tokens, leaving room for the prompt)
  if (content.length > 12000) {
    content = content.substring(0, 12000) + "... [content truncated]";
  }

  return content;
}

// Function to check if URL is from Linktree
function isLinktreeUrl(url) {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname === "linktr.ee" || urlObj.hostname === "www.linktr.ee"
    );
  } catch (error) {
    return false;
  }
}

// Function to extract URLs from Linktree page
async function extractLinktreeUrls(page, linktreeUrl) {
  try {
    await page.goto(linktreeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for links to load
    await page.waitForSelector("a[href]", { timeout: 10000 });

    // Extract all external links from the Linktree page
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      return anchors
        .map((anchor) => anchor.href)
        .filter((href) => {
          // Filter out internal Linktree links and invalid URLs
          try {
            const url = new URL(href);
            return (
              url.hostname !== "linktr.ee" &&
              url.hostname !== "www.linktr.ee" &&
              (url.protocol === "http:" || url.protocol === "https:")
            );
          } catch {
            return false;
          }
        });
    });

    // Remove duplicates
    return [...new Set(links)];
  } catch (error) {
    console.error(
      `Error extracting Linktree URLs from ${linktreeUrl}:`,
      error.message
    );
    return [];
  }
}

// Function to process a single URL and extract events
async function processUrl(page, url, clubID) {
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const html = await page.content();
    const cleanedContent = cleanHTML(html);


    // Parse with OpenAI
    const prompt = `
You are an event extraction assistant. Extract events from the following website content.

IMPORTANT: You must respond with ONLY a valid JSON array. Do not include any explanations, markdown formatting, or other text.

Extract events that have dates and return them as a JSON array with this exact structure:
[
  {
    "title": "Event Name",
    "startDate": "2025-01-17",
    "endDate": "2025-01-18",
    "description": "Brief description",
    "eventURL": "${url}"
  }
]

If no events are found, return an empty array: []

Website content:
${cleanedContent}
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });

    const rawResponse = completion.choices[0].message.content.trim();

    // More robust JSON extraction
    let eventsString = extractFromCodeBlock(rawResponse);

    // Additional cleanup for common issues
    eventsString = eventsString
      .replace(/^[^[\{]*/, "") // Remove anything before first [ or {
      .replace(/[^}\]]*$/, "") // Remove anything after last } or ]
      .trim();

    // Validate it looks like JSON before parsing
    if (!eventsString.startsWith("[") && !eventsString.startsWith("{")) {
      console.log(
        `Invalid JSON format from ${url}, skipping. Response: ${rawResponse.substring(
          0,
          200
        )}...`
      );
      return [];
    }

    const eventsJson = JSON.parse(eventsString);

    // Ensure we have an array
    const eventsArray = Array.isArray(eventsJson) ? eventsJson : [eventsJson];

    const processedEvents = eventsArray
      .filter((e) => e && e.title && e.startDate) // Filter out invalid events
      .map((e) => ({
        ...e,
        clubID,
        eventURL: e.eventURL || url, // Fallback to page URL if no specific event URL
      }));

    console.log(
      `Found ${processedEvents.length} events for ${clubID} from ${url}`
    );
    return processedEvents;
  } catch (error) {
    if (error.message.includes("Unexpected token")) {
      console.error(
        `JSON parsing error for ${url}. Raw response might not be JSON format.`
      );
    } else {
      console.error(`Error processing URL ${url}:`, error.message);
    }
    return [];
  }
}
