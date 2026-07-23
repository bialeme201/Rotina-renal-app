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
