# Project Structure

```
revgain-extension/
│
├── src/                          # Source files
│   ├── background/              # Background service worker
│   │   └── background.ts        # TypeScript service worker
│   ├── content/                 # Content script
│   │   └── content.ts           # TypeScript content script
│   ├── sidepanel/               # React sidepanel application
│   │   ├── components/          # React components
│   │   │   ├── HealthScore.tsx
│   │   │   ├── ScoreCards.tsx
│   │   │   ├── EarlyWatchSignals.tsx
│   │   │   ├── RevenueInsights.tsx
│   │   │   ├── EmailDraft.tsx
│   │   │   └── SettingsModal.tsx
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useRevgainApi.ts
│   │   │   └── useHubSpotContext.ts
│   │   ├── App.tsx              # Main React app component
│   │   ├── main.tsx             # React entry point
│   │   ├── index.html           # HTML template
│   │   └── sidepanel.css        # Global styles (Tailwind)
│   ├── types/                   # TypeScript type definitions
│   │   └── index.ts             # All type definitions
│   ├── icons/                   # Extension icons (optional)
│   │   ├── icon16.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   ├── manifest.json            # Extension manifest
│   └── sidepanel.css            # Global CSS (moved to sidepanel/)
│
├── dist/                        # Build output (generated)
│   ├── manifest.json
│   ├── content.js
│   ├── background.js
│   ├── sidepanel.html
│   ├── assets/                  # Bundled JS/CSS
│   └── icons/                   # Copied icons
│
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript configuration
├── tsconfig.node.json           # TypeScript config for Node
├── tailwind.config.js           # Tailwind CSS configuration
├── postcss.config.js            # PostCSS configuration
├── package.json                 # Dependencies and scripts
├── .gitignore                   # Git ignore rules
├── README.md                    # Full documentation
├── QUICKSTART.md               # Quick setup guide
└── PROJECT_STRUCTURE.md         # This file
```

## Key Files

### Build Configuration
- **`vite.config.ts`** - Vite build configuration for Chrome extension
- **`tsconfig.json`** - TypeScript compiler options
- **`tailwind.config.js`** - Tailwind CSS configuration
- **`package.json`** - Dependencies and npm scripts

### Source Files
- **`src/manifest.json`** - Chrome extension manifest (copied to dist)
- **`src/background/background.ts`** - Service worker for API calls
- **`src/content/content.ts`** - Content script for HubSpot detection
- **`src/sidepanel/`** - React application for the sidepanel UI

### React Components
- **`App.tsx`** - Main application component
- **`HealthScore.tsx`** - Health score display component
- **`ScoreCards.tsx`** - Renewal risk and upsell opportunity cards
- **`EarlyWatchSignals.tsx`** - Early watch signals list
- **`RevenueInsights.tsx`** - Revenue insights display
- **`EmailDraft.tsx`** - Email draft generator
- **`SettingsModal.tsx`** - Settings modal for API key

### Hooks
- **`useRevgainApi.ts`** - Hook for Revgain API calls
- **`useHubSpotContext.ts`** - Hook for HubSpot context management

### Types
- **`src/types/index.ts`** - All TypeScript type definitions

## Build Process

1. **Development**: `npm run dev` - Watches files and rebuilds
2. **Production**: `npm run build` - Creates optimized build in `dist/`
3. **Load Extension**: Load the `dist` folder in Chrome

## Data Flow

1. **User navigates to HubSpot contact page**
   ↓
2. **`content.ts` detects page and extracts context**
   ↓
3. **Context sent to `background.ts` via chrome.runtime.sendMessage**
   ↓
4. **`background.ts` stores context and notifies sidepanel**
   ↓
5. **User opens sidepanel**
   ↓
6. **`App.tsx` uses `useHubSpotContext` hook to get context**
   ↓
7. **`App.tsx` uses `useRevgainApi` hook to fetch insights**
   ↓
8. **Components render insights data**

## TypeScript Types

All types are defined in `src/types/index.ts`:

- `HubSpotContext` - Contact/company context
- `RevgainInsights` - Revenue insights data
- `HealthScore` - Health score with factors
- `EarlyWatchSignal` - Signal data
- `EmailDraft` - Generated email
- `MessageRequest/Response` - Chrome message types

## Styling

- **Tailwind CSS** - Utility-first CSS framework
- **PostCSS** - CSS processing
- **Global styles** - `src/sidepanel.css`

## Extension Entry Points

1. **Content Script**: `src/content/content.ts` → `dist/content.js`
2. **Background Worker**: `src/background/background.ts` → `dist/background.js`
3. **Sidepanel**: `src/sidepanel/index.html` → `dist/sidepanel.html`
