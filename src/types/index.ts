// Message types for Chrome extension communication
export type MessageType =
  | 'SET_OPENAI_KEY'
  | 'GET_OPENAI_KEY_STATUS'
  | 'GET_TAB_INFO'
  | 'GET_ALL_TABS'
  | 'TAB_CHANGED'
  | 'TAB_UPDATED'
  | 'OPEN_LOGIN'
  | 'LOGIN_SUCCESS'
  | 'GET_AUTH_TOKENS'
  | 'CUSTOMER_DETAILS_FOUND';

export interface MessageRequest {
  type: MessageType;
  apiKey?: string;
  tabId?: number;
  tokens?: Record<string, any>;
  customerDetails?: Record<string, any>;
}

export interface AuthTokens {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  tokenType?: string;
  [key: string]: any;
}

export interface MessageResponse {
  success: boolean;
  data?: any;
  error?: string;
  configured?: boolean;
  windowId?: number;
}
