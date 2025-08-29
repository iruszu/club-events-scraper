/** @format */

require('dotenv').config()
const express = require('express')
const puppeteer = require('puppeteer')
const fs = require('fs')
const {JSDOM} = require('jsdom')

const openai = require('./src/openai')
const {
	addEventsToOpportunities,
	getClubs,
	getExistingEventTitles,
	deleteEventByTitle,
	deleteAllOpportunitiesForAllClubs,
} = require('./src/firebase') // Import your Firebase helper functions

const app = express()
const PORT = 3000

app.get('/', (req, res) => {
	res.send('Hello from your Node.js server!')
})

// Example route to scrape events:
app.get('/scrape-events', async (req, res) => {
	const browser = await puppeteer.launch()
	const page = await browser.newPage()

	try {
		const allClubs = await getClubs()
		console.log(`Fetched ${allClubs.length} clubs`)

		const allEvents = []

		// Process each club
		for (const club of allClubs) {
			const clubID = club.id
			const urls = club.urls || club.URLS || []
			// Prefer 'banner' field, fallback to 'image', fallback to empty string
			const clubImageUrl = club.image || club.banner || ''

			// Fetch existing event titles for this club from Firestore
			const existingTitles = new Set(await getExistingEventTitles(clubID))
			console.log(
				`Found ${existingTitles.size} existing events for club ${clubID}`
			)

			if (!urls || urls.length === 0) {
				console.log(`No URLs found for club: ${clubID}`)
				continue
			}

			console.log(`Processing ${urls.length} URLs for club: ${clubID}`)

			// Process each URL for this club
			for (const url of urls) {
				try {
					console.log(`Fetching: ${url}`)

					// Check if this is a Linktree URL
					if (isLinktreeUrl(url)) {
						console.log(`Processing Linktree URL: ${url}`)
						const linktreeUrls = await extractLinktreeUrls(page, url)
						console.log(`Found ${linktreeUrls.length} links in Linktree`)

						// Process each extracted URL from Linktree
						for (const linktreeUrl of linktreeUrls) {
							try {
								console.log(`Processing Linktree extracted URL: ${linktreeUrl}`)
								const events = await processUrl(
									page,
									linktreeUrl,
									clubID,
									clubImageUrl
								)
								// Filter out events with duplicate titles (case-insensitive)
								const filteredEvents = events.filter(
									(event) => !existingTitles.has(event.title.toLowerCase())
								)
								if (events.length !== filteredEvents.length) {
									console.log(
										`Filtered out ${
											events.length - filteredEvents.length
										} duplicate events for ${clubID}`
									)
								}
								allEvents.push(...filteredEvents)
							} catch (linkError) {
								console.error(
									`Error processing Linktree link ${linktreeUrl}:`,
									linkError.message
								)
								continue
							}
						}
					} else if (url.includes('ubctradinggroup.com/events')) {
						// Custom scraper for UBC Trading Group events
						const events = await scrapeUBCTradingGroupEvents(
							page,
							url,
							clubID,
							clubImageUrl
						)
						// Filter out events with duplicate titles (case-insensitive)
						const filteredEvents = events.filter(
							(event) => !existingTitles.has(event.title.toLowerCase())
						)
						if (events.length !== filteredEvents.length) {
							console.log(
								`Filtered out ${
									events.length - filteredEvents.length
								} duplicate events for ${clubID}`
							)
						}
						allEvents.push(...filteredEvents)
					} else {
						// Process regular URL
						const events = await processUrl(page, url, clubID, clubImageUrl)
						// Filter out events with duplicate titles (case-insensitive)
						const filteredEvents = events.filter(
							(event) => !existingTitles.has(event.title.toLowerCase())
						)
						if (events.length !== filteredEvents.length) {
							console.log(
								`Filtered out ${
									events.length - filteredEvents.length
								} duplicate events for ${clubID}`
							)
						}
						allEvents.push(...filteredEvents)
					}
				} catch (urlError) {
					console.error(
						`Error processing URL ${url} for club ${clubID}:`,
						urlError.message
					)
					continue
				}
			}
		}

		await browser.close()

		console.log(`Total events found: ${allEvents.length}`)

		// Remove duplicates by clubID and title (case-insensitive)
		const seen = new Set()
		const uniqueEvents = []
		for (const event of allEvents) {
			const key = `${event.clubID}_${event.title.toLowerCase()}`
			if (!seen.has(key)) {
				seen.add(key)
				uniqueEvents.push(event)
			}
		}

		console.log(
			`After removing cross-club duplicates: ${uniqueEvents.length} unique events`
		)

		// Group unique events by club and save to Firestore
		const eventsByClub = uniqueEvents.reduce((acc, event) => {
			if (!acc[event.clubID]) {
				acc[event.clubID] = []
			}
			acc[event.clubID].push(event)
			return acc
		}, {})

		// Save events for each club
		for (const [clubID, events] of Object.entries(eventsByClub)) {
			try {
				await addEventsToOpportunities(clubID, events)
				console.log(`Saved ${events.length} events for club: ${clubID}`)
			} catch (firestoreError) {
				console.error(`Error saving events for club ${clubID}:`, firestoreError)
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
		})
	} catch (err) {
		await browser.close()
		console.error('Error in scrape-events:', err)
		res.status(500).json({
			success: false,
			error: 'Error scraping events',
			message: err.message,
		})
	}
})

// Admin route to delete all opportunities subcollections for all clubs
app.post('/delete', async (req, res) => {
	try {
		await deleteAllOpportunitiesForAllClubs()
		res.json({
			success: true,
			message: 'All opportunities deleted for all clubs.',
		})
	} catch (err) {
		console.error('Error deleting all opportunities:', err)
		res.status(500).json({success: false, error: err.message})
	}
})

app.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`)
})

// Function to extract content from code blocks if present, otherwise return original
function extractFromCodeBlock(text) {
	// Look for triple backticks with optional language identifier
	const codeBlockRegex = /```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?```/
	const match = text.match(codeBlockRegex)

	if (match) {
		return match[1].trim()
	}

	// If no code block found, return the original text
	return text.trim()
}

// Function to clean HTML and keep only content
function cleanHTML(html) {
	const dom = new JSDOM(html)
	const document = dom.window.document

	// Remove unwanted elements
	const unwantedSelectors = [
		'head',
		'meta',
		'link',
		'style',
		'script',
		'noscript',
		'title',
		'svg',
		'iframe',
		'video',
		'audio',
		'canvas',
		// 'nav',
		// 'footer',
		// 'header',
		// "[class*='nav']",
		"[class*='menu']",
		// "[class*='footer']",
		// "[class*='header']",
		"[class*='sidebar']",
		"[class*='cookie']",
		"[class*='popup']",
		"[class*='modal']",
	]

	unwantedSelectors.forEach((selector) => {
		const elements = document.querySelectorAll(selector)
		elements.forEach((el) => el.remove())
	})

	// Get the body content or fallback to documentElement
	const body = document.body || document.documentElement
	let content = body.textContent || body.innerText || ''

	// Clean up whitespace and limit content length
	content = content
		.replace(/\s+/g, ' ') // Replace multiple whitespace with single space
		.replace(/\n+/g, '\n') // Replace multiple newlines with single newline
		.trim()

	// Limit content to approximately 12000 characters to stay well under token limit
	// (roughly 3000-4000 tokens, leaving room for the prompt)
	if (content.length > 12000) {
		content = content.substring(0, 12000) + '... [content truncated]'
	}

	return content
}

// Function to check if URL is from Linktree
function isLinktreeUrl(url) {
	try {
		const urlObj = new URL(url)
		return (
			urlObj.hostname === 'linktr.ee' || urlObj.hostname === 'www.linktr.ee'
		)
	} catch (error) {
		return false
	}
}

// Function to extract URLs from Linktree page
async function extractLinktreeUrls(page, linktreeUrl) {
	try {
		await page.goto(linktreeUrl, {
			waitUntil: 'domcontentloaded',
			timeout: 30000,
		})

		// Wait for links to load
		await page.waitForSelector('a[href]', {timeout: 10000})

		// Extract all external links from the Linktree page
		const links = await page.evaluate(() => {
			const anchors = Array.from(document.querySelectorAll('a[href]'))
			return anchors
				.map((anchor) => anchor.href)
				.filter((href) => {
					// Filter out internal Linktree links and invalid URLs
					try {
						const url = new URL(href)
						return (
							url.hostname !== 'linktr.ee' &&
							url.hostname !== 'www.linktr.ee' &&
							(url.protocol === 'http:' || url.protocol === 'https:')
						)
					} catch {
						return false
					}
				})
		})

		// Remove duplicates
		return [...new Set(links)]
	} catch (error) {
		console.error(
			`Error extracting Linktree URLs from ${linktreeUrl}:`,
			error.message
		)
		return []
	}
}

// Helper: Try to extract a year from the event title or banner
function extractYearFromText(text) {
	const match = text && text.match(/(20\d{2})/)
	return match ? parseInt(match[1], 10) : null
}

// Function to process a single URL and extract events
async function processUrl(page, url, clubID, clubImageUrl) {
	try {
		await page.goto(url, {
			waitUntil: 'domcontentloaded',
			timeout: 30000,
		})

		// Extract image URLs from the page (handle lazy-loaded and background images)
		const imageUrls = await page.evaluate(() => {
			// Get src, data-src, data-lazy from <img> tags
			const imgSrcs = Array.from(document.querySelectorAll('img')).map(
				(img) =>
					img.src ||
					img.getAttribute('data-src') ||
					img.getAttribute('data-lazy') ||
					''
			)
			// Get background-image URLs from inline styles
			const bgSrcs = Array.from(
				document.querySelectorAll('[style*="background-image"]')
			).map((el) => {
				const match = el.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)
				return match ? match[1] : null
			})
			return [...imgSrcs, ...bgSrcs].filter(Boolean)
		})
		console.log('Image URLs found:', imageUrls)

		const html = await page.content()
		const cleanedContent = cleanHTML(html)

		// Parse with OpenAI
		const prompt = `
You are an event extraction assistant. Extract events from the following website content.

Here are the image URLs found on the page:
${imageUrls.map((img, i) => `${i + 1}. ${img}`).join('\n')}


IMPORTANT: For each event, only use an image from the list above if it is clearly associated with that specific event (e.g., is referenced in the event description, or is presented with the event).
If there is no clearly associated image, use this default club image: "${clubImageUrl}".

IMPORTANT: You must respond with ONLY a valid JSON array. Do not include any explanations, markdown formatting, or other text.
IMPORTANT: Use the full, exact event title as it appears in the website content. Do not shorten or paraphrase event names.
IMPORTANT: Use the full, exact event date as it appears in the website content associated with the event. If only a day and month are provided, assume the event is in the current year.
IMPORTANT: If an event is represented as a hyperlink, use the anchor text as the event title if it appears to be an event name.

Extract events that have dates and return them as a JSON array with this exact structure.
[
  {
    "title": "Event Name",
    "startDate": "2025-01-17",
    "description": "Brief description",
    "eventURL": "${url}",
    "image": "Direct URL to the most relevant image from the list above associated with the event, or the default club image ${clubImageUrl} if none."
  }
]

If no events are found, return an empty array: []

Website content:
${cleanedContent}
`

		const completion = await openai.chat.completions.create({
			model: 'gpt-3.5-turbo',
			messages: [{role: 'user', content: prompt}],
			temperature: 0.1,
		})

		const rawResponse = completion.choices[0].message.content.trim()

		// More robust JSON extraction
		let eventsString = extractFromCodeBlock(rawResponse)

		// Additional cleanup for common issues
		eventsString = eventsString
			.replace(/^[^[\{]*/, '') // Remove anything before first [ or {
			.replace(/[^}\]]*$/, '') // Remove anything after last } or ]
			.trim()

		// Validate it looks like JSON before parsing
		if (!eventsString.startsWith('[') && !eventsString.startsWith('{')) {
			console.log(
				`Invalid JSON format from ${url}, skipping. Response: ${rawResponse.substring(
					0,
					200
				)}...`
			)
			return []
		}

		const eventsJson = JSON.parse(eventsString)

		// Ensure we have an array
		const eventsArray = Array.isArray(eventsJson) ? eventsJson : [eventsJson]

		const processedEvents = eventsArray
			.filter((e) => e && e.title && e.startDate) // Filter out invalid events
			.map((e) => {
				// Force use of default banner for certain clubs
				const clubsForceDefaultBanner = [
					// Add club IDs here (e.g., 'ubc-biztech', 'ubc-trading-group')
					// Example: 'ubc-biztech',
					'temp-pm',
					'temp-bucs',
					'temp-nscc',
					'temp-fa',
					'temp-hewe',
				]

				let image
				if (clubsForceDefaultBanner.includes(clubID)) {
					image = clubImageUrl
				} else {
					image =
						typeof e.image === 'string' &&
						e.image.trim() &&
						e.image.trim().toLowerCase() !== 'undefined'
							? e.image.trim()
							: clubImageUrl
				}

				// --- Date Correction Logic ---
				let startDate = e.startDate
				const yearFromTitle = extractYearFromText(e.title)
				const yearFromBanner = extractYearFromText(clubImageUrl)
				const correctYear = yearFromTitle || yearFromBanner
				if (correctYear) {
					const dateObj = new Date(startDate)
					if (
						!isNaN(dateObj.getTime()) &&
						correctYear &&
						dateObj.getFullYear() !== correctYear
					) {
						// Replace year with correctYear if the extracted date is in the future
						const corrected = new Date(startDate)
						corrected.setFullYear(correctYear)
						startDate = corrected.toISOString().slice(0, 10)
					}
				}

				return {
					...e,
					clubID,
					eventURL: e.eventURL || url, // Fallback to page URL if no specific event URL
					image,
					startDate,
				}
			})

		console.log(
			`Found ${processedEvents.length} events for ${clubID} from ${url}`
		)
		return processedEvents
	} catch (error) {
		if (error.message.includes('Unexpected token')) {
			console.error(
				`JSON parsing error for ${url}. Raw response might not be JSON format.`
			)
		} else {
			console.error(`Error processing URL ${url}:`, error.message)
		}
		return []
	}
}

// Custom scraper for UBC Trading Group events
async function scrapeUBCTradingGroupEvents(page, url, clubID, clubImageUrl) {
	await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000})

	const events = await page.evaluate(
		(clubID, clubImageUrl) => {
			const results = []
			const eventNodes = Array.from(
				document.querySelectorAll('.eventlist-event')
			)

			eventNodes.forEach((node) => {
				// Title: prefer .eventlist-title, fallback to .eventlist-title-link
				let title =
					node.querySelector('.eventlist-title')?.innerText?.trim() ||
					node.querySelector('.eventlist-title-link')?.innerText?.trim() ||
					''

				// Date: from <time class="event-date">
				const dateElem = node.querySelector('time.event-date')
				let startDate = ''
				if (dateElem) {
					startDate = dateElem.getAttribute('datetime') || ''
					// fallback: try to parse innerText if datetime is missing
					if (!startDate && dateElem.innerText) {
						const parsed = new Date(dateElem.innerText.trim())
						if (!isNaN(parsed.getTime())) {
							startDate = parsed.toISOString().slice(0, 10)
						}
					}
				}

				// Description: join all <p> tags inside .eventlist-description, fallback to all <p> in node
				let description = ''
				const descContainer = node.querySelector('.eventlist-description')
				if (descContainer) {
					description = Array.from(descContainer.querySelectorAll('p'))
						.map((p) => p.innerText.trim())
						.filter(Boolean)
						.join('\n')
				} else {
					description = Array.from(node.querySelectorAll('p'))
						.map((p) => p.innerText.trim())
						.filter(Boolean)
						.join('\n')
				}

				// Image: first <img> in the event, or default
				const img = node.querySelector('img')?.src || clubImageUrl

				if (title && startDate) {
					results.push({
						title,
						startDate: startDate.length === 10 ? startDate : '',
						description,
						eventURL: window.location.href,
						image: img,
						clubID,
					})
				}
			})

			return results
		},
		clubID,
		clubImageUrl
	)

	return events
}
