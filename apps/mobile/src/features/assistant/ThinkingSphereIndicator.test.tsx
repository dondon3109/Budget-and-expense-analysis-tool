import { render } from "@testing-library/react-native";
import { RadarWaveRings, ThinkingSphereCore } from "./ThinkingSphereIndicator";

describe("ThinkingSphereIndicator", () => {
  it("renders radar wave rings without crashing", async () => {
    const { toJSON } = await render(<RadarWaveRings color="#2563eb" />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders thinking sphere core without crashing", async () => {
    const { toJSON } = await render(<ThinkingSphereCore color="#ffffff" />);
    expect(toJSON()).toBeTruthy();
  });
});
