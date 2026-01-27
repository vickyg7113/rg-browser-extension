/**
 * Environment variables
 * These are replaced at build time by Vite
 */

export const RGDEV_URL = import.meta.env.VITE_RGDEV_URL || 'https://poc6.revgain.ai';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://devgw.revgain.ai';
