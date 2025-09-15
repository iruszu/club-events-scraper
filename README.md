<!-- @format -->

# Club Events Scraper

A web scraping system that automatically discovers and aggregates events from
club websites, Linktree pages, and social media platforms. Built with Node.js,
Puppeteer, OpenAI API, and Firebase.

## 🚀 Features

- **Multi-Source Scraping**: Extracts events from various sources including:
  - Club websites
  - Linktree profiles
  - Instagram posts
  - Custom event platforms (e.g., UBC Trading Group)
- **AI-Powered Extraction**: Uses OpenAI GPT to intelligently parse and
  structure event data
- **Smart Deduplication**: Prevents duplicate events across multiple sources
- **Firebase Integration**: Stores events in Firestore with club-specific
  organization
- **Flexible Architecture**: Easy to add new scrapers and data sources

## 🛠️ Tech Stack

- **Node.js** - Runtime environment
- **Puppeteer** - Web scraping and browser automation
- **OpenAI GPT-3.5** - AI-powered content extraction
- **Firebase Firestore** - Database for storing events
- **Express.js** - Web server for API endpoints
- **JSDOM** - HTML parsing and content cleaning

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- OpenAI API key
- Firebase project with Firestore enabled
- Firebase service account key

## ⚙️ Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/iruszu/club-events-scraper.git
   cd club-events-scraper
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables** Create a `.env` file in the root directory:

   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   FIREBASE_PROJECT_ID=your_firebase_project_id
   FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
   FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./src/firebase/serviceAccountKey.json
   ```

4. **Configure Firebase**
   - Place your Firebase service account key as
     `src/firebase/serviceAccountKey.json`
   - Ensure your Firestore database has a `clubs` collection with the following
     structure:
     ```json
     {
     	"id": "club-id",
     	"name": "Club Name",
     	"urls": ["https://club-website.com", "https://linktr.ee/club"],
     	"image": "https://club-image-url.com",
     	"last_checked": "timestamp"
     }
     ```

## 🚀 Usage

1. **Start the server**

   ```bash
   npm start
   ```

2. **Scrape events** Visit `http://localhost:3000/scrape-events` to trigger the
   scraping process.

3. **API Endpoints**
   - `GET /` - Health check
   - `GET /scrape-events` - Scrape events from all configured clubs
   - `POST /delete` - Delete all opportunities (admin only)

## 📁 Project Structure

```
club-events-scraper/
├── src/
│   ├── firebase/
│   │   ├── index.js              # Firebase operations
│   │   ├── initializeAdmin.js    # Firebase initialization
│   │   └── serviceAccountKey.json # Firebase credentials (ignored)
│   ├── instagram/
│   │   └── scraper.js            # Instagram scraping logic
│   └── openai/
│       └── index.js              # OpenAI client configuration
├── index.js                      # Main application entry point
├── package.json
└── README.md
```

## 🔧 Configuration

### Adding New Clubs

Add clubs to your Firestore `clubs` collection with the following structure:

```json
{
	"id": "unique-club-id",
	"name": "Club Display Name",
	"urls": ["https://club-website.com/events", "https://linktr.ee/clubname"],
	"image": "https://club-logo-url.com/image.jpg",
	"last_checked": "2024-01-01T00:00:00Z"
}
```

### Custom Scrapers

The system supports custom scrapers for specific platforms. See
`scrapeUBCTradingGroupEvents()` in `index.js` for an example.

## 🔒 Security

- Environment variables are stored in `.env` (ignored by Git)
- Firebase service account keys are ignored by Git
- Sensitive data is never committed to the repository

## 📊 Event Data Structure

Events are stored in Firestore with the following structure:

```json
{
	"title": "Event Name",
	"startDate": "2024-01-17",
	"description": "Event description",
	"eventURL": "https://event-url.com",
	"image": "https://event-image-url.com",
	"clubID": "club-id"
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file
for details.

## 🆘 Troubleshooting

### Common Issues

1. **Puppeteer browser issues**: Ensure you have the necessary system
   dependencies
2. **OpenAI API errors**: Check your API key and rate limits
3. **Firebase connection issues**: Verify your service account key and project
   configuration

### Debug Mode

Enable detailed logging by setting `NODE_ENV=development` in your `.env` file.

## 📞 Support

If you encounter any issues or have questions, please open an issue on GitHub.

---

**Note**: This scraper is designed for educational and legitimate data
collection purposes. Always respect website terms of service and implement
appropriate rate limiting.
