const mockDelete = jest.fn();

jest.mock("expo-file-system", () => ({
  File: class MockExpoFile {
    readonly mockUri: string;

    constructor(mockPath: string) {
      this.mockUri = mockPath;
    }

    delete() {
      mockDelete(this.mockUri);
    }
  },
}));

import { discardTemporarySourceFile } from "./temporary-source-file";

describe("discardTemporarySourceFile", () => {
  beforeEach(() => mockDelete.mockClear());

  it("removes an in-flight source file after the caller is done with it", () => {
    discardTemporarySourceFile("file:///cache/source.pdf");

    expect(mockDelete).toHaveBeenCalledWith("file:///cache/source.pdf");
  });

  it("does nothing when no source file was created", () => {
    discardTemporarySourceFile(null);

    expect(mockDelete).not.toHaveBeenCalled();
  });
});
