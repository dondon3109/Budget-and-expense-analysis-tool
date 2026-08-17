import release from "./androidRelease.json";

export interface AndroidRelease {
  packageId: string;
  versionName: string;
  versionCode: number;
  filename: string;
  downloadPath: string;
  checksumPath?: string;
  sha256: string;
  sizeBytes: number;
  sizeLabel: string;
  releaseDate: string;
  releaseDateLabel: string;
  minimumAndroid: string;
  targetApi?: number;
  certificateSha256: string;
  reinstallRequired: boolean;
  notes?: readonly string[];
}

/**
 * Build-time fallback metadata for the last shipped Android Beta. The live
 * install page prefers the remote R2 metadata (android/latest.json) and only
 * falls back to this trusted snapshot when R2 is unavailable or invalid.
 */
export const ANDROID_RELEASE: AndroidRelease = {
  ...release,
  reinstallRequired: false,
};
