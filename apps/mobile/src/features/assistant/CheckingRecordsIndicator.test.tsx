import { render, screen } from "@testing-library/react-native";
import { CheckingRecordsIndicator } from "./CheckingRecordsIndicator";

describe("CheckingRecordsIndicator", () => {
  it("renders default label text and accessible indicator", async () => {
    await render(<CheckingRecordsIndicator />);
    expect(screen.getByText("Checking your records…")).toBeTruthy();
  });

  it("renders custom label and small variant", async () => {
    await render(<CheckingRecordsIndicator label="Analyzing accounts…" size="small" />);
    expect(screen.getByText("Analyzing accounts…")).toBeTruthy();
  });
});
