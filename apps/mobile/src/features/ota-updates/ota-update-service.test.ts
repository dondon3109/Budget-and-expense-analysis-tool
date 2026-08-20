import { checkAndDownloadOtaUpdate, type OtaUpdateClient } from "./ota-update-service";

function client(overrides: Partial<OtaUpdateClient> = {}): OtaUpdateClient {
  return {
    isEnabled: true,
    checkForUpdateAsync: jest.fn(async () => ({
      isAvailable: false,
      isRollBackToEmbedded: false,
    })),
    fetchUpdateAsync: jest.fn(async () => ({
      isNew: true,
      isRollBackToEmbedded: false,
    })),
    reloadAsync: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe("OTA update service", () => {
  it("leaves the current bundle alone when no compatible update exists", async () => {
    const ota = client();

    await expect(checkAndDownloadOtaUpdate(ota)).resolves.toEqual({ status: "current" });
    expect(ota.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it("downloads a compatible update without invoking any APK behavior", async () => {
    const ota = client({
      checkForUpdateAsync: jest.fn(async () => ({
        isAvailable: true,
        isRollBackToEmbedded: false,
      })),
    });
    const phases: string[] = [];

    await expect(checkAndDownloadOtaUpdate(ota, (phase) => phases.push(phase))).resolves.toEqual({
      status: "ready",
      rollBackToEmbedded: false,
    });
    expect(phases).toEqual(["checking", "downloading"]);
    expect(ota.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(ota.reloadAsync).not.toHaveBeenCalled();
  });

  it("downloads a server rollback and waits for an explicit restart", async () => {
    const ota = client({
      checkForUpdateAsync: jest.fn(async () => ({
        isAvailable: false,
        isRollBackToEmbedded: true,
      })),
      fetchUpdateAsync: jest.fn(async () => ({
        isNew: false,
        isRollBackToEmbedded: true,
      })),
    });

    await expect(checkAndDownloadOtaUpdate(ota)).resolves.toEqual({
      status: "ready",
      rollBackToEmbedded: true,
    });
    expect(ota.reloadAsync).not.toHaveBeenCalled();
  });

  it("reports current if the server has nothing new by fetch time", async () => {
    const ota = client({
      checkForUpdateAsync: jest.fn(async () => ({
        isAvailable: true,
        isRollBackToEmbedded: false,
      })),
      fetchUpdateAsync: jest.fn(async () => ({
        isNew: false,
        isRollBackToEmbedded: false,
      })),
    });

    await expect(checkAndDownloadOtaUpdate(ota)).resolves.toEqual({ status: "current" });
  });
});
