/**
 * Content script to monitor login on rgdev.revgain.ai
 * Extracts tokens from localStorage, sessionStorage, cookies, or URL params
 * Only operates on the login domain to avoid interfering with other pages
 */

// Environment variables - inlined to avoid chunk splitting issues in content scripts
const RGDEV_URL = import.meta.env.VITE_RGDEV_URL || 'https://rgdev.revgain.ai';

// Extract hostname from RGDEV_URL
const RGDEV_HOSTNAME = new URL(RGDEV_URL).hostname;

// Check if we're on the login domain
const isLoginDomain = window.location.hostname === RGDEV_HOSTNAME;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'EXTRACT_TOKENS') {
    if (!isLoginDomain) {
      sendResponse({ success: false, error: 'Not on login domain' });
      return false;
    }
    extractTokens()
      .then(tokens => {
        sendResponse({ success: true, tokens });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  return false;
});

/**
 * Extract customerDetails from localStorage
 */
async function extractCustomerDetails(): Promise<Record<string, any> | null> {
  try {
    // Check localStorage for customerDetails
    const customerDetailsStr = localStorage.getItem('customerDetails');
    if (customerDetailsStr) {
      try {
        return JSON.parse(customerDetailsStr);
      } catch {
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.warn('[LoginMonitor] Could not extract customerDetails:', error);
    return null;
  }
}

/**
 * Extract tokens from various sources
 */
async function extractTokens(): Promise<Record<string, any>> {
  const tokens: Record<string, any> = {};

  try {
    // Extract from localStorage - check all keys, not just ones with "token" in name
    try {
      const localStorageKeys = Object.keys(localStorage);
      for (const key of localStorageKeys) {
        const value = localStorage.getItem(key);
        if (value) {
          // Include keys that might contain auth data
          const keyLower = key.toLowerCase();
          if (keyLower.includes('token') || 
              keyLower.includes('auth') ||
              keyLower.includes('access') ||
              keyLower.includes('refresh') ||
              keyLower.includes('session') ||
              keyLower.includes('user') ||
              keyLower.includes('login') ||
              keyLower.includes('rg') ||
              keyLower.includes('revgain')) {
            try {
              tokens[key] = JSON.parse(value);
            } catch {
              tokens[key] = value;
            }
          }
        }
      }
      // If no specific tokens found, include all localStorage (might contain nested auth data)
      if (Object.keys(tokens).length === 0 && localStorageKeys.length > 0) {
        for (const key of localStorageKeys) {
          const value = localStorage.getItem(key);
          if (value) {
            try {
              const parsed = JSON.parse(value);
              // If it's an object, check if it contains auth-related data
              if (typeof parsed === 'object' && parsed !== null) {
                const str = JSON.stringify(parsed).toLowerCase();
                if (str.includes('token') || str.includes('auth') || str.includes('access')) {
                  tokens[key] = parsed;
                }
              }
            } catch {
              // Not JSON, skip
            }
          }
        }
      }
    } catch (e) {
      console.warn('[LoginMonitor] Could not access localStorage:', e);
    }

    // Extract from sessionStorage
    try {
      const sessionStorageKeys = Object.keys(sessionStorage);
      for (const key of sessionStorageKeys) {
        const value = sessionStorage.getItem(key);
        if (value) {
          const keyLower = key.toLowerCase();
          if (keyLower.includes('token') || 
              keyLower.includes('auth') ||
              keyLower.includes('access') ||
              keyLower.includes('refresh') ||
              keyLower.includes('session') ||
              keyLower.includes('user') ||
              keyLower.includes('login') ||
              keyLower.includes('rg') ||
              keyLower.includes('revgain')) {
            try {
              tokens[key] = JSON.parse(value);
            } catch {
              tokens[key] = value;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[LoginMonitor] Could not access sessionStorage:', e);
    }

    // Extract from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const urlHash = new URLSearchParams(window.location.hash.substring(1));
    
    for (const [key, value] of [...urlParams.entries(), ...urlHash.entries()]) {
      if (key.toLowerCase().includes('token') || 
          key.toLowerCase().includes('auth') ||
          key.toLowerCase().includes('access') ||
          key.toLowerCase().includes('refresh')) {
        tokens[key] = value;
      }
    }

    // Extract from cookies (via document.cookie)
    try {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [key, value] = cookie.trim().split('=');
        if (key && (key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('auth') ||
            key.toLowerCase().includes('access') ||
            key.toLowerCase().includes('refresh'))) {
          tokens[key] = decodeURIComponent(value);
        }
      }
    } catch (e) {
      console.warn('Could not access cookies:', e);
    }

    // Check for common token storage patterns in window object
    try {
      const windowAny = window as any;
      if (windowAny.__TOKEN__) tokens['__TOKEN__'] = windowAny.__TOKEN__;
      if (windowAny.authToken) tokens['authToken'] = windowAny.authToken;
      if (windowAny.accessToken) tokens['accessToken'] = windowAny.accessToken;
    } catch (e) {
      console.warn('Could not access window tokens:', e);
    }

  } catch (error) {
    console.error('Error extracting tokens:', error);
  }

  return tokens;
}

// Only monitor if we're on the login domain
if (isLoginDomain) {
  let hasSentTokens = false; // Prevent multiple sends
  let hasSentCustomerDetails = false; // Prevent multiple sends for customerDetails
  let checkInterval: number | null = null;
  
  // Function to check and send customerDetails (can be sent before login)
  async function checkAndSendCustomerDetails() {
    if (hasSentCustomerDetails) {
      return; // Already sent
    }
    
    const customerDetails = await extractCustomerDetails();
    if (customerDetails && Object.keys(customerDetails).length > 0) {
      hasSentCustomerDetails = true;
      console.log('[LoginMonitor] Sending customerDetails to background (before login)');
      chrome.runtime.sendMessage({
        type: 'CUSTOMER_DETAILS_FOUND',
        customerDetails
      }).then((response) => {
        console.log('[LoginMonitor] Background response for customerDetails:', response);
      }).catch((error) => {
        console.error('[LoginMonitor] Error sending customerDetails:', error);
      });
    }
  }

  // Function to check for tokens and send if found
  async function checkAndSendTokens() {
    if (hasSentTokens) {
      console.log('[LoginMonitor] Tokens already sent, skipping check');
      return; // Already sent, don't check again
    }
    
    const tokens = await extractTokens();
    const customerDetails = await extractCustomerDetails();
    const currentUrl = window.location.href;
    
    console.log('[LoginMonitor] Checking tokens. URL:', currentUrl, 'Token keys:', Object.keys(tokens));
    if (customerDetails) {
      console.log('[LoginMonitor] Found customerDetails:', Object.keys(customerDetails));
    }
    
    // Check if we're on a post-login page (not on /login anymore)
    const isPostLoginPage = !currentUrl.includes('/login') && 
                           (currentUrl.includes('/dashboard') || 
                            currentUrl.includes('/home') || 
                            currentUrl.includes('/success') ||
                            currentUrl.includes(RGDEV_HOSTNAME));
    
    console.log('[LoginMonitor] Is post-login page:', isPostLoginPage, 'Has tokens:', Object.keys(tokens).length > 0);
    
    // If we have tokens and we're on a post-login page, send them
    if (Object.keys(tokens).length > 0 && isPostLoginPage) {
      hasSentTokens = true;
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
      
      console.log('[LoginMonitor] Sending tokens and customerDetails to background. Token count:', Object.keys(tokens).length);
      chrome.runtime.sendMessage({
        type: 'LOGIN_SUCCESS',
        tokens,
        customerDetails: customerDetails || undefined
      }).then((response) => {
        console.log('[LoginMonitor] Background response:', response);
        if (!response || !response.success) {
          console.error('[LoginMonitor] Background rejected tokens:', response?.error);
        }
      }).catch((error) => {
        console.error('[LoginMonitor] Error sending tokens:', error);
      });
    } else if (Object.keys(tokens).length === 0 && isPostLoginPage) {
      console.warn('[LoginMonitor] On post-login page but no tokens found');
    }
  }

  // Monitor for URL changes (SPA navigation)
  let lastUrl = location.href;
  
  // Use both popstate and hashchange for SPA navigation
  window.addEventListener('popstate', () => {
    setTimeout(checkAndSendTokens, 500);
  });
  
  window.addEventListener('hashchange', () => {
    setTimeout(checkAndSendTokens, 500);
  });
  
  // Monitor DOM changes for SPA navigation
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(checkAndSendTokens, 500);
    }
  }).observe(document, { subtree: true, childList: true });

  // Check for customerDetails immediately (can be available before login)
  checkAndSendCustomerDetails();
  setTimeout(checkAndSendCustomerDetails, 1000);
  setTimeout(checkAndSendCustomerDetails, 3000);
  
  // Check on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Check for customerDetails
      checkAndSendCustomerDetails();
      
      // Check immediately and then periodically for tokens
      setTimeout(checkAndSendTokens, 1000);
      setTimeout(checkAndSendTokens, 3000);
      setTimeout(checkAndSendTokens, 5000);
      
      // Also check periodically in case tokens are set later
      checkInterval = window.setInterval(checkAndSendTokens, 2000);
      
      // Stop checking after 30 seconds
      setTimeout(() => {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
      }, 30000);
    });
  } else {
    // Page already loaded, check immediately
    checkAndSendCustomerDetails();
    setTimeout(checkAndSendTokens, 1000);
    setTimeout(checkAndSendTokens, 3000);
    setTimeout(checkAndSendTokens, 5000);
    
    // Also check periodically
    checkInterval = window.setInterval(checkAndSendTokens, 2000);
    
    // Stop checking after 30 seconds
    setTimeout(() => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
    }, 30000);
  }
}
