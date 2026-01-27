# Revgain.ai HubSpot Chrome Extension

A Chrome extension built with **Vite + React + TypeScript** that integrates Revgain.ai revenue insights directly into HubSpot contact pages, providing real-time renewal risk scores, upsell opportunities, early watch signals, and AI-powered email drafts.

## Features

- **360° Health Score**: Comprehensive account health perspective from Revgain
- **Renewal Risk & Upsell Opportunity**: Real-time scoring for account management
- **Early Watch Signals**: Proactive alerts for at-risk accounts
- **Revenue Insights**: Detailed revenue intelligence overlay
- **AI Email Drafter**: Context-aware email generation using Revgain's account AI
- **Modern Tech Stack**: Built with Vite, React, and TypeScript for maintainability

## Tech Stack

- **Vite** - Fast build tool and dev server
- **React 18** - UI library
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **Chrome Extension Manifest V3** - Latest extension API

## Development

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Chrome browser (Manifest V3 compatible)
- Revgain.ai API key
- HubSpot account (test portal or production)

### Setup Steps

1. **Install Dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

2. **Build the Extension**
   ```bash
   npm run build
   ```

3. **Development Mode (Watch)**
   ```bash
   npm run dev
   ```
   This will watch for changes and rebuild automatically.

4. **Load the Extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `dist` folder (created after build)

5. **Configure API Key**
   - Navigate to any HubSpot contact page
   - Click the Revgain extension icon in the Chrome toolbar
   - Click the settings icon (⚙️) in the sidepanel
   - Enter your Revgain API key
   - Click "Save"

## Project Structure

```
revgain-extension/
├── src/
│   ├── background/          # Background service worker
│   │   └── background.ts
│   ├── content/            # Content script
│   │   └── content.ts
│   ├── sidepanel/          # React sidepanel app
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── App.tsx         # Main app component
│   │   ├── main.tsx        # React entry point
│   │   └── index.html      # HTML template
│   ├── types/              # TypeScript type definitions
│   │   └── index.ts
│   ├── manifest.json       # Extension manifest
│   └── sidepanel.css       # Global styles
├── dist/                   # Build output (generated)
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
├── tailwind.config.js     # Tailwind CSS configuration
└── package.json           # Dependencies and scripts
```

## Usage

1. **Navigate to a HubSpot Contact Page**
   - Open any contact record in your HubSpot portal
   - The extension automatically detects the contact and company

2. **View Revgain Insights**
   - Click the Revgain extension icon in the Chrome toolbar
   - The sidepanel will display:
     - Company name and contact ID
     - Health score
     - Renewal risk and upsell opportunity scores
     - Early watch signals
     - Revenue insights

3. **Generate Email Drafts**
   - In the sidepanel, scroll to "AI Email Draft"
   - Click "Generate Follow-up Email"
   - Copy the subject and body to use in HubSpot's email composer

## Building for Production

```bash
npm run build
```

The built extension will be in the `dist` folder. This is what you load into Chrome.

## Development Workflow

1. Make changes to source files in `src/`
2. Run `npm run dev` to watch and rebuild automatically
3. In Chrome, go to `chrome://extensions/`
4. Click the refresh icon on your extension card to reload
5. Test your changes

## TypeScript

The project is fully typed with TypeScript. Types are defined in `src/types/index.ts` and include:

- `HubSpotContext` - Contact/company context from HubSpot
- `RevgainInsights` - Revenue insights data
- `HealthScore` - Health score with factors
- `EarlyWatchSignal` - Early watch signal data
- `EmailDraft` - Generated email content
- `MessageRequest/Response` - Chrome extension message types

## API Integration

The extension integrates with Revgain.ai API endpoints:

- `POST /v1/insights` - Get revenue insights
- `POST /v1/signals` - Get early watch signals
- `POST /v1/health-score` - Get 360° health score
- `POST /v1/email-draft` - Generate AI email draft

### API Request Format

```json
{
  "company_name": "Acme Corp",
  "context": {
    "contactId": "12345",
    "contactEmail": "john@acme.com"
  }
}
```

## Security

- **API Key Storage**: API keys are stored locally using `chrome.storage.local` (encrypted by Chrome)
- **Permissions**: Extension only requests permissions for `*.hubspot.com` and `*.revgain.ai`
- **No Data Collection**: Extension does not collect or transmit user data beyond API calls
- **Type Safety**: TypeScript ensures type safety throughout the codebase

## Debugging

### Content Script
- Check console on HubSpot pages (F12)
- Look for "Revgain Extension" log messages

### Background Worker
- Go to `chrome://extensions/`
- Click "service worker" link under the extension
- Check console for errors

### Sidepanel (React)
- Right-click the sidepanel → Inspect
- Use React DevTools extension for component inspection
- Check console for React errors

### Common Issues

**"API key not configured"**
- Ensure you've saved your API key in settings
- Check that the key is valid and has proper permissions

**"No company detected"**
- Verify you're on a HubSpot contact page
- Check that the URL contains `/contact/`
- Try refreshing the page

**Build errors**
- Run `npm install` to ensure all dependencies are installed
- Check Node.js version (requires 18+)
- Clear `node_modules` and reinstall if needed

**Extension not loading**
- Ensure you're loading the `dist` folder, not `src`
- Run `npm run build` first
- Check for errors in `chrome://extensions/`

## Permissions

The extension requires the following permissions:

- `storage` - To store API keys locally
- `sidePanel` - To display the insights panel
- `host_permissions` for `*.hubspot.com` - To access HubSpot pages
- `host_permissions` for `*.revgain.ai` - To call Revgain API

## Browser Compatibility

- Chrome 109+ (Manifest V3 support)
- Edge 109+ (Chromium-based)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run build` to ensure it builds
5. Test in Chrome
6. Submit a pull request

## License

[Specify your license here]

## Changelog

### v2.0.0
- Migrated to Vite + React + TypeScript
- Improved type safety
- Better code organization with components and hooks
- Modern build tooling

### v1.0.0
- Initial release
- HubSpot contact page detection
- Revgain API integration
- Health score, renewal risk, and upsell opportunity display
- Early watch signals
- AI email draft generator
- Settings page for API key management
