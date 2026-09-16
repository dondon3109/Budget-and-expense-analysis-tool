import { fireEvent, render, screen } from "@testing-library/react-native";

import { useVoiceLanguageStore } from "@/stores/voice-language-store";
import {
  VoiceLanguageBadgeButton,
  VoiceLanguagePicker,
  VoiceLanguageToggleGroup,
} from "./voice-language-picker";

describe("VoiceLanguagePicker component", () => {
  beforeEach(() => {
    useVoiceLanguageStore.setState({ language: "auto" });
  });

  it("renders Auto, English, and Tagalog options with Auto selected by default", async () => {
    await render(<VoiceLanguagePicker />);

    expect(screen.getByText("Auto")).toBeTruthy();
    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.getByText("English")).toBeTruthy();
    expect(screen.getByText("Tagalog")).toBeTruthy();

    const autoRadio = screen.getByLabelText(/Auto, Automatically detects/);
    expect(autoRadio.props.accessibilityState?.selected).toBe(true);

    const enRadio = screen.getByLabelText(/English, Optimized for English/);
    expect(enRadio.props.accessibilityState?.selected).toBe(false);
  });

  it("changes language when another option is pressed", async () => {
    await render(<VoiceLanguagePicker />);

    const tagalogRadio = screen.getByLabelText(/Tagalog, Optimized for Tagalog/);
    fireEvent.press(tagalogRadio);

    expect(useVoiceLanguageStore.getState().language).toBe("fil");
  });
});

describe("VoiceLanguageToggleGroup component", () => {
  beforeEach(() => {
    useVoiceLanguageStore.setState({ language: "auto" });
  });

  it("renders segmented buttons for Auto, English, and Tagalog", async () => {
    await render(<VoiceLanguageToggleGroup />);

    expect(screen.getByLabelText("Auto voice language")).toBeTruthy();
    expect(screen.getByLabelText("English voice language")).toBeTruthy();
    expect(screen.getByLabelText("Tagalog voice language")).toBeTruthy();

    expect(screen.getByLabelText("Auto voice language").props.accessibilityState?.selected).toBe(
      true,
    );
    expect(screen.getByLabelText("English voice language").props.accessibilityState?.selected).toBe(
      false,
    );
  });

  it("switches language on toggle press", async () => {
    await render(<VoiceLanguageToggleGroup />);

    fireEvent.press(screen.getByLabelText("English voice language"));
    expect(useVoiceLanguageStore.getState().language).toBe("en");
  });
});

describe("VoiceLanguageBadgeButton component", () => {
  beforeEach(() => {
    useVoiceLanguageStore.setState({ language: "auto" });
  });

  it("displays current short label and cycles on press", async () => {
    await render(<VoiceLanguageBadgeButton />);

    expect(screen.getByText("AUTO")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: /Voice language: Auto/ }));
    expect(useVoiceLanguageStore.getState().language).toBe("en");
  });
});
