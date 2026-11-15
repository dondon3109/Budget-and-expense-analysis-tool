// Jest uses this automatically for every suite. The real module needs the native store
// module on import. Suites that drive Google Play Billing set these mocks' results.
module.exports = {
  initConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(async () => []),
  getAvailablePurchases: jest.fn(async () => []),
  requestPurchase: jest.fn(async () => null),
  finishTransaction: jest.fn(async () => undefined),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  isUserCancelledError: jest.fn(
    (error) => typeof error === "object" && error !== null && error.code === "user-cancelled",
  ),
  getUserFriendlyErrorMessage: jest.fn((error) => error?.message ?? "Purchase failed."),
};
