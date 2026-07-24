// Polyfills the window.storage.get/set API the component was written against,
// backed by the browser's localStorage so the app works outside its original host.
window.storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    return value === null ? null : { value };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
  },
};

// Most browsers cap localStorage around 5MB; this is a conservative shared assumption
// since there's no reliable cross-browser API to read the real quota synchronously.
const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;

export function getStorageEstimate() {
  let totalChars = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      totalChars += key.length + (localStorage.getItem(key) || "").length;
    }
  } catch (err) {
    return { usedBytes: 0, quotaBytes: STORAGE_QUOTA_BYTES, percentUsed: 0 };
  }
  const usedBytes = totalChars * 2; // UTF-16: 2 bytes per character
  return { usedBytes, quotaBytes: STORAGE_QUOTA_BYTES, percentUsed: usedBytes / STORAGE_QUOTA_BYTES };
}
