

export const randomId = () => Math.random().toString(36).substr(2, 9);

export const withTimeout = (promise, timeoutMs, message) => Promise.race([
  promise,
  new Promise((_, reject) => {
    const err = new Error(message);
    err.code = 'timeout';
    setTimeout(() => reject(err), timeoutMs);
  }),
]);
