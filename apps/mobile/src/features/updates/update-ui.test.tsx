import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { UpdateSettingsCardView } from "./UpdateSettingsCard";
import { AndroidUpdateOverlayView } from "./UpdatePrompt";
import { installedApp, parsedRelease } from "./test-fixtures";
import type { AndroidUpdateController } from "./use-android-updates";

function cardProps(
  overrides: Partial<ComponentProps<typeof UpdateSettingsCardView>> = {},
): ComponentProps<typeof UpdateSettingsCardView> {
  return {
    supported: true,
    status: "idle",
    installed: installedApp(),
    latest: null,
    error: null,
    progress: null,
    onCheck: jest.fn(),
    onUpdate: jest.fn(),
    onCancelDownload: jest.fn(),
    onOpenInstallPage: jest.fn(),
    onOpenUnknownSourcesSettings: jest.fn(),
    ...overrides,
  };
}

function controller(overrides: Partial<AndroidUpdateController> = {}): AndroidUpdateController {
  return {
    supported: true,
    status: "available",
    installed: installedApp(),
    latest: parsedRelease(),
    error: null,
    progress: null,
    timing: null,
    prompt: "available",
    check: jest.fn(async () => undefined),
    updateNow: jest.fn(async () => undefined),
    later: jest.fn(async () => undefined),
    cancelDownload: jest.fn(),
    openInstallPage: jest.fn(async () => undefined),
    openUnknownSourcesSettings: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe("Android update settings card", () => {
  it("shows the checking state", async () => {
    await render(<UpdateSettingsCardView {...cardProps({ status: "checking" })} />);
    expect(screen.getAllByText("Checking…").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  });

  it("shows the up-to-date state", async () => {
    await render(<UpdateSettingsCardView {...cardProps({ status: "current" })} />);
    expect(screen.getByText("Zoption is up to date")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeTruthy();
  });

  it("shows an unable-to-check state", async () => {
    await render(
      <UpdateSettingsCardView
        {...cardProps({ status: "error", error: "Unable to check for updates" })}
      />,
    );
    expect(screen.getByText("Unable to check for updates")).toBeTruthy();
  });

  it("shows an update and starts it from Update now", async () => {
    const onUpdate = jest.fn();
    await render(
      <UpdateSettingsCardView
        {...cardProps({
          status: "available",
          latest: parsedRelease(),
          onUpdate,
        })}
      />,
    );
    expect(screen.getByText(/You have 0.2.0-beta/)).toBeTruthy();
    expect(screen.getByText(/0.2.1-beta/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Update now" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows download progress and can cancel", async () => {
    const onCancelDownload = jest.fn();
    await render(
      <UpdateSettingsCardView
        {...cardProps({
          status: "downloading",
          latest: parsedRelease(),
          progress: { bytesWritten: 512, totalBytes: 1024 },
          onCancelDownload,
        })}
      />,
    );
    expect(screen.getByText(/Downloading/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel download" }));
    expect(onCancelDownload).toHaveBeenCalledTimes(1);
  });

  it("shows download and verification failures", async () => {
    await render(
      <UpdateSettingsCardView
        {...cardProps({
          status: "failed",
          error: "The update could not be downloaded. Try again when you have a stable connection.",
        })}
      />,
    );
    expect(screen.getByText(/could not be downloaded/)).toBeTruthy();

    await render(
      <UpdateSettingsCardView
        {...cardProps({
          status: "failed",
          error: "The update file could not be verified. The download was discarded.",
        })}
      />,
    );
    expect(screen.getByText(/could not be verified/)).toBeTruthy();
  });

  it("shows the install-permission required flow", async () => {
    const onOpenUnknownSourcesSettings = jest.fn();
    await render(
      <UpdateSettingsCardView
        {...cardProps({
          status: "needsPermission",
          onOpenUnknownSourcesSettings,
        })}
      />,
    );
    expect(screen.getByText(/Allow Zoption to install updates/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Allow installs" }));
    expect(onOpenUnknownSourcesSettings).toHaveBeenCalledTimes(1);
  });

  it("shows the reinstall-required flow", async () => {
    const onOpenInstallPage = jest.fn();
    await render(
      <UpdateSettingsCardView
        {...cardProps({
          status: "reinstallRequired",
          latest: parsedRelease({ reinstallRequired: true }),
          onOpenInstallPage,
        })}
      />,
    );
    expect(screen.getByText(/cannot replace this installed copy/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Open install page" }));
    expect(onOpenInstallPage).toHaveBeenCalledTimes(1);
  });
});

describe("Android update prompt", () => {
  it("offers Update now and Later for a normal update", async () => {
    const updates = controller();
    await render(<AndroidUpdateOverlayView updates={updates} />);
    expect(screen.getByRole("header", { name: "Update available" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Update now" }));
    expect(updates.updateNow).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Later" }));
    expect(updates.later).toHaveBeenCalledTimes(1);
  });

  it("directs a reinstall-required update to the install page", async () => {
    const updates = controller({
      status: "reinstallRequired",
      prompt: "reinstallRequired",
      latest: parsedRelease({ reinstallRequired: true }),
    });
    await render(<AndroidUpdateOverlayView updates={updates} />);
    expect(screen.getByRole("header", { name: "Fresh install required" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Open install page" }));
    expect(updates.openInstallPage).toHaveBeenCalledTimes(1);
  });
});
