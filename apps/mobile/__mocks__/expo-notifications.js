// Jest uses this automatically for every suite (a root __mocks__ entry for a
// node module needs no jest.mock call). The real module evaluates native and
// Expo Go checks on import, which session-state reaches through the daily
// reminder cleanup. Suites that assert on notifications mock it explicitly.
module.exports = {
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async () => ""),
  setNotificationHandler: jest.fn(),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
};
