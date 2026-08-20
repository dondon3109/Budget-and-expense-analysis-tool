import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  OtaUpdateSettingsCardView,
  type OtaUpdateSettingsCardViewProps,
} from "./OtaUpdateSettingsCard";

function props(
  overrides: Partial<OtaUpdateSettingsCardViewProps> = {},
): OtaUpdateSettingsCardViewProps {
  return {
    supported: true,
    status: "idle",
    error: null,
    onCheck: jest.fn(),
    onRestart: jest.fn(),
    ...overrides,
  };
}

describe("OTA update settings card", () => {
  it("stays absent when this build has OTA disabled", async () => {
    await render(<OtaUpdateSettingsCardView {...props({ supported: false })} />);
    expect(screen.queryByText("Quick updates")).toBeNull();
  });

  it("keeps the APK channel visibly separate", async () => {
    await render(<OtaUpdateSettingsCardView {...props()} />);
    expect(
      screen.getByText(/Native changes still use the verified APK updater below/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check for quick fixes" })).toBeTruthy();
  });

  it("shows download state without offering a restart early", async () => {
    await render(<OtaUpdateSettingsCardView {...props({ status: "downloading" })} />);
    expect(screen.getByText("Downloading a compatible quick update…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restart and apply" })).toBeNull();
    expect(screen.getByRole("button", { name: "Downloading…" })).toBeDisabled();
  });

  it("restarts only after a compatible update is ready", async () => {
    const onRestart = jest.fn();
    await render(<OtaUpdateSettingsCardView {...props({ status: "ready", onRestart })} />);
    await fireEvent.press(screen.getByRole("button", { name: "Restart and apply" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("explains that a failed check did not change the installed app", async () => {
    await render(
      <OtaUpdateSettingsCardView
        {...props({
          status: "error",
          error: "Zoption could not check for a quick update. Your installed app is unchanged.",
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/installed app is unchanged/i);
  });
});
