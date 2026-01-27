# Quick Start Guide

Get your Revgain HubSpot extension up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Build the Extension

```bash
npm run build
```

This creates a `dist` folder with the compiled extension.

## Step 3: Load the Extension

1. Open Chrome
2. Go to `chrome://extensions/`
3. Toggle **Developer mode** ON (top-right)
4. Click **Load unpacked**
5. Select the **`dist`** folder (not `src`!)

## Step 4: Configure Your API Key

1. Go to any HubSpot contact page (e.g., `https://app.hubspot.com/contacts/{portal-id}/contact/{contact-id}`)
2. Click the **Revgain extension icon** in Chrome toolbar
3. Click the **⚙️ Settings** icon in the sidepanel
4. Enter your **Revgain API key**
5. Click **Save**

## Step 5: Test It Out

1. Navigate to a HubSpot contact page
2. Click the Revgain extension icon
3. You should see:
   - Company name and contact ID
   - Health score
   - Renewal risk and upsell opportunity
   - Early watch signals (if any)
   - Revenue insights

## Development Mode

For development with auto-rebuild:

```bash
npm run dev
```

Then reload the extension in Chrome after each change.

## Troubleshooting

**Extension icon not showing?**
- Make sure Developer mode is enabled
- Check for errors in `chrome://extensions/`
- Ensure you loaded the `dist` folder, not `src`

**Build errors?**
- Run `npm install` to ensure dependencies are installed
- Check Node.js version (requires 18+)
- Clear `node_modules` and reinstall if needed

**"API key not configured" error?**
- Go to settings and save your API key
- Make sure you're using a valid Revgain API key

**"No company detected"?**
- Ensure you're on a HubSpot contact page (URL contains `/contact/`)
- Refresh the page
- Check browser console for errors (F12)

**API calls failing?**
- Verify your API key is correct
- Check network tab in DevTools
- Ensure Revgain API is accessible from your network

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Customize components in `src/sidepanel/components/`
- Modify types in `src/types/index.ts`
- Add your extension icons in `src/icons/`
