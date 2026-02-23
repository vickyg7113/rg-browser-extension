/**
 * Background Service Worker
 */

import type { MessageRequest, MessageResponse, AuthTokens } from '../types';
import { setApiKey, getApiKeyStatus } from './openaiService';

// Environment variables - inlined to avoid chunk splitting issues in service workers
const RGDEV_URL = import.meta.env.VITE_RGDEV_URL || 'https://rgdev.revgain.ai';

// Listen for messages from sidepanel
chrome.runtime.onMessage.addListener((
  request: MessageRequest,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
): boolean => {
  if (request.type === 'SET_OPENAI_KEY') {
    if (!request.apiKey) {
      sendResponse({ success: false, error: 'API key is required' });
      return false;
    }
    setApiKey(request.apiKey)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.type === 'GET_OPENAI_KEY_STATUS') {
    getApiKeyStatus()
      .then(configured => sendResponse({ success: true, configured }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.type === 'GET_TAB_INFO') {
    // Get tab info - can specify tabId or use the tab that has the sidepanel open
    const targetTabId = request.tabId;

    if (targetTabId) {
      // Get specific tab
      chrome.tabs.get(targetTabId).then((tab) => {
        if (!tab.url) {
          sendResponse({ success: false, error: 'Tab URL not available' });
          return;
        }
        fetchTabInfo(tab).then((info) => {
          sendResponse({ success: true, data: info });
        }).catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    } else {
      // Get active tab in the CURRENT window (where sidepanel is open), excluding login domain and extension pages
      // This ensures we get the tab from the window where the extension was opened, not other windows
      chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (!tabs[0]?.id || !tabs[0]?.url) {
          sendResponse({ success: false, error: 'Could not access current tab' });
          return;
        }

        const activeTab = tabs[0];
        const rgdevHostname = new URL(RGDEV_URL).hostname;

        // If the active tab is the login domain or extension page, try to find another tab in the same window
        if (activeTab.url && (
          activeTab.url.startsWith('chrome-extension://') ||
          activeTab.url.startsWith('chrome://') ||
          activeTab.url.includes(rgdevHostname)
        )) {
          // Get all tabs in the current window and find a non-login, non-extension tab
          chrome.tabs.query({ currentWindow: true }).then((allTabs) => {
            const mainTab = allTabs.find(tab =>
              tab.url &&
              !tab.url.startsWith('chrome-extension://') &&
              !tab.url.startsWith('chrome://') &&
              !tab.url.includes(rgdevHostname) &&
              (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
            );

            const targetTab = mainTab || activeTab;

            if (!targetTab?.id || !targetTab?.url) {
              sendResponse({ success: false, error: 'Could not access main tab' });
              return;
            }
            fetchTabInfo(targetTab).then((info) => {
              sendResponse({ success: true, data: info });
            }).catch((error) => {
              sendResponse({ success: false, error: error.message });
            });
          }).catch((error) => {
            sendResponse({ success: false, error: error.message });
          });
        } else {
          // Active tab is valid, use it
          fetchTabInfo(activeTab).then((info) => {
            sendResponse({ success: true, data: info });
          }).catch((error) => {
            sendResponse({ success: false, error: error.message });
          });
        }
      }).catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    }
    return true; // Keep channel open for async response
  } else if (request.type === 'GET_ALL_TABS') {
    // Get all tabs in current window
    chrome.tabs.query({ currentWindow: true }).then((tabs) => {
      const tabList = tabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        active: tab.active,
        favIconUrl: tab.favIconUrl
      }));
      sendResponse({ success: true, data: { tabs: tabList } });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (request.type === 'OPEN_LOGIN') {
    // Open login page in a new window
    const loginUrl = `${RGDEV_URL}/login`;
    chrome.windows.create({
      url: loginUrl,
      type: 'popup',
      width: 500,
      height: 700
    }).then((window) => {
      const tabId = window?.tabs?.[0]?.id;
      const windowId = window.id;

      // Store both windowId and tabId to track the popped login window
      if (windowId && tabId) {
        chrome.storage.local.set({
          loginWindowId: windowId,
          loginTabId: tabId
        });
      }

      // Note: loginMonitor.js is already registered as content script in manifest
      // It will automatically run on the login page, no need to inject manually
      sendResponse({ success: true, windowId: window.id });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  } else if (request.type === 'LOGIN_SUCCESS') {
    // Only process LOGIN_SUCCESS from the popped login window
    // Verify that the message is coming from the tracked login window
    chrome.storage.local.get(['loginWindowId', 'loginTabId']).then(async (storage) => {
      const loginWindowId = storage.loginWindowId;

      // Verify we have a tracked login window
      if (!loginWindowId) {
        console.warn('[Background] No active login window found');
        sendResponse({ success: false, error: 'No active login window found' });
        return;
      }

      // Verify the sender window matches the login window
      // This is the most important check - the window ID should match
      if (_sender.tab?.windowId !== loginWindowId) {
        console.warn('[Background] Message not from login window. Expected:', loginWindowId, 'Got:', _sender.tab?.windowId);
        sendResponse({ success: false, error: 'Message not from login window' });
        return;
      }

      // Also verify the URL is from the login domain
      const rgdevHostname = new URL(RGDEV_URL).hostname;
      if (_sender.tab?.url && !_sender.tab.url.includes(rgdevHostname)) {
        console.warn('[Background] Message not from login domain:', _sender.tab.url);
        sendResponse({ success: false, error: 'Message not from login domain' });
        return;
      }

      // Store tokens when login is successful
      if (request.tokens && Object.keys(request.tokens).length > 0) {
        try {
          console.log('[Background] Storing tokens from login window');
          await storeAuthTokens(request.tokens);

          // Store customerDetails if provided
          if (request.customerDetails) {
            console.log('[Background] Storing customerDetails from login window');
            await chrome.storage.local.set({
              customerDetails: request.customerDetails,
              customerDetailsTimestamp: Date.now()
            });
          }

          // Close the login window
          if (loginWindowId) {
            chrome.windows.remove(loginWindowId).catch((error) => {
              console.warn('[Background] Could not close login window:', error);
              // Window might already be closed, ignore
            });
          }

          // Clear the stored login window/tab IDs
          chrome.storage.local.remove(['loginWindowId', 'loginTabId']);

          console.log('[Background] Login successful, tokens and customerDetails stored');
          sendResponse({ success: true });

          // Notify sidepanel if open
          chrome.runtime.sendMessage({
            type: 'LOGIN_SUCCESS',
            tokens: request.tokens,
            customerDetails: request.customerDetails
          }).catch(() => {
            // Sidepanel might not be open, ignore
          });
        } catch (error) {
          console.error('[Background] Error storing tokens:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      } else {
        console.warn('[Background] No tokens provided or tokens object is empty');
        sendResponse({ success: false, error: 'No tokens provided' });
      }
    }).catch((error) => {
      console.error('[Background] Error processing LOGIN_SUCCESS:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    });
    return true;
  } else if (request.type === 'GET_AUTH_TOKENS') {
    // Get stored auth tokens
    getAuthTokens()
      .then((tokens) => {
        sendResponse({ success: true, data: tokens });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.type === 'CUSTOMER_DETAILS_FOUND') {
    // Store customerDetails when found (can be before login)
    if (request.customerDetails) {
      chrome.storage.local.set({
        customerDetails: request.customerDetails,
        customerDetailsTimestamp: Date.now()
      }).then(() => {
        console.log('[Background] CustomerDetails stored');
        sendResponse({ success: true });
      }).catch((error) => {
        console.error('[Background] Error storing customerDetails:', error);
        sendResponse({ success: false, error: error.message });
      });
    } else {
      sendResponse({ success: false, error: 'No customerDetails provided' });
    }
    return true;
  }

  return false;
});

/**
 * Check if a URL is supported by the extension based on manifest permissions
 */
async function isUrlSupported(url: string): Promise<boolean> {
  try {
    // Check if the manifest has permissions for this origin
    const origin = new URL(url).origin + '/*';
    return await chrome.permissions.contains({ origins: [origin] });
  } catch (error) {
    return false;
  }
}

/**
 * Fetch tab information (cookies, localStorage, etc.)
 */
async function fetchTabInfo(tab: chrome.tabs.Tab): Promise<any> {
  if (!tab.url || !tab.id) {
    throw new Error('Invalid tab');
  }

  const isSupported = await isUrlSupported(tab.url);
  const url = new URL(tab.url);

  // Get cookies for the domain
  const cookies = await chrome.cookies.getAll({ domain: url.hostname });

  // Get localStorage and HTML by injecting script
  let localStorage: Record<string, string> = {};
  let htmlContent = '';
  let scriptError: string | undefined;

  try {
    // Only try to inject if it's an http/https page AND supported
    const protocol = url.protocol;
    if (isSupported && (protocol === 'http:' || protocol === 'https:')) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const storage: Record<string, string> = {};
          try {
            const localStore = window.localStorage;
            for (let i = 0; i < localStore.length; i++) {
              const key = localStore.key(i);
              if (key) {
                storage[key] = localStore.getItem(key) || '';
              }
            }
          } catch (e) {
            // Cross-origin or other error
          }

          return {
            storage,
            html: document.documentElement.outerHTML
          };
        }
      });

      const result = results[0]?.result;
      if (result) {
        localStorage = result.storage || {};
        htmlContent = result.html || '';
      }
    }
  } catch (error) {
    scriptError = error instanceof Error ? error.message : 'Unknown error';
  }

  return {
    tabId: tab.id,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    hostname: url.hostname,
    protocol: url.protocol,
    pathname: url.pathname,
    isSupported: isSupported,
    cookies: cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      expirationDate: c.expirationDate
    })),
    localStorage: localStorage,
    html: htmlContent,
    scriptError: scriptError
  };
}

// Open sidepanel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for tab updates to notify sidepanel
chrome.tabs.onActivated.addListener((activeInfo) => {
  // Notify sidepanel that active tab changed
  chrome.runtime.sendMessage({
    type: 'TAB_CHANGED',
    tabId: activeInfo.tabId
  }).catch(() => {
    // Sidepanel might not be open, ignore error
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    // Notify sidepanel that tab was updated
    chrome.runtime.sendMessage({
      type: 'TAB_UPDATED',
      tabId: tabId
    }).catch(() => {
      // Sidepanel might not be open, ignore error
    });
  }
});

/**
 * Store authentication tokens
 */
async function storeAuthTokens(tokens: Record<string, any>): Promise<void> {
  await chrome.storage.local.set({
    authTokens: tokens,
    authTokensTimestamp: Date.now()
  });
}

/**
 * Get stored authentication tokens
 */
async function getAuthTokens(): Promise<AuthTokens | null> {
  const result = await chrome.storage.local.get(['authTokens']);
  return (result.authTokens as AuthTokens) || null;
}
