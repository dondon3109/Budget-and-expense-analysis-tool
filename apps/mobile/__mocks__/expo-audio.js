// Jest uses this automatically for every suite. The real module throws on
// import without the native audio module, and Button reaches it through the
// sound effects. Suites that assert on audio mock it explicitly.
module.exports = {
  createAudioPlayer: jest.fn(() => ({ play: jest.fn(), seekTo: jest.fn(async () => undefined) })),
};
