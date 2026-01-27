/**
 * OpenAI service for API key management
 */

/**
 * Get stored OpenAI API key
 */
async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(['openaiApiKey']);
  return (result.openaiApiKey as string) || null;
}

/**
 * Store OpenAI API key securely
 */
export async function setApiKey(apiKey: string): Promise<void> {
  await chrome.storage.local.set({ openaiApiKey: apiKey });
}

/**
 * Get API key status
 */
export async function getApiKeyStatus(): Promise<boolean> {
  const apiKey = await getApiKey();
  return !!apiKey;
}
