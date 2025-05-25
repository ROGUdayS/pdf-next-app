export const rateLimiter = {
  check: async () => ({ allowed: true, remaining: 10 }),
  increment: async () => {},
};
