#!/usr/bin/env bash

set -euo pipefail
set +x
umask 077

ANDROID_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPOSITORY_ROOT="$(cd "${ANDROID_ROOT}/../.." && pwd)"
USER_HOME_DIRECTORY="$(dscl . -read "/Users/$(id -un)" NFSHomeDirectory | awk '{print $2}')"
ANDROID_SDK_DIRECTORY="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-${USER_HOME_DIRECTORY}/Library/Android/sdk}}"
JAVA_HOME="${JAVA_HOME:-${USER_HOME_DIRECTORY}/.bubblewrap/jdk/jdk-17.0.11+9/Contents/Home}"
KEYSTORE_PATH="${ZOPTION_ANDROID_KEYSTORE:-${USER_HOME_DIRECTORY}/.zoption-android-signing/zoption-release.jks}"
KEYSTORE_ALIAS="${ZOPTION_ANDROID_KEY_ALIAS:-zoption-release}"
RELEASE_DIRECTORY="${ZOPTION_ANDROID_RELEASE_DIR:-${USER_HOME_DIRECTORY}/Builds/Zoption}"
KEYCHAIN_SERVICE="${ZOPTION_ANDROID_KEYCHAIN_SERVICE:-Zoption Android Release Keystore}"
KEYCHAIN_ACCOUNT="${ZOPTION_ANDROID_KEYCHAIN_ACCOUNT:-site.zoption.android}"

export JAVA_HOME
export ANDROID_HOME="${ANDROID_SDK_DIRECTORY}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_DIRECTORY}"

if [[ ! -f "${KEYSTORE_PATH}" ]]; then
  echo "Release keystore not found at ${KEYSTORE_PATH}." >&2
  exit 1
fi

if [[ ! -x "${JAVA_HOME}/bin/java" ]]; then
  echo "Java 17 was not found at ${JAVA_HOME}." >&2
  exit 1
fi

BUILD_TOOLS_DIRECTORY="$(find "${ANDROID_SDK_DIRECTORY}/build-tools" -mindepth 1 -maxdepth 1 -type d -print | sort | tail -n 1)"
ZIPALIGN="${BUILD_TOOLS_DIRECTORY}/zipalign"
APKSIGNER="${BUILD_TOOLS_DIRECTORY}/apksigner"

if [[ ! -x "${ZIPALIGN}" || ! -x "${APKSIGNER}" ]]; then
  echo "Android build tools with zipalign and apksigner are required." >&2
  exit 1
fi

VERSION_NAME="$(node -p "require('${ANDROID_ROOT}/package.json').version")"
RELEASE_FILENAME="zoption-android-${VERSION_NAME}.apk"
RELEASE_APK="${RELEASE_DIRECTORY}/${RELEASE_FILENAME}"
RELEASE_CHECKSUM="${RELEASE_APK}.sha256"

if [[ -e "${RELEASE_APK}" || -e "${RELEASE_CHECKSUM}" ]]; then
  echo "Refusing to overwrite the existing ${VERSION_NAME} release in ${RELEASE_DIRECTORY}." >&2
  echo "Increase the application version before producing another permanent release." >&2
  exit 1
fi

TEMPORARY_DIRECTORY="$(mktemp -d)"
cleanup() {
  unset ZOPTION_APK_STORE_PASSWORD ZOPTION_APK_KEY_PASSWORD
  rm -rf "${TEMPORARY_DIRECTORY}"
}
trap cleanup EXIT

cd "${ANDROID_ROOT}"
node scripts/verify-version.mjs

BUBBLEWRAP_ARGUMENTS=(build --skipSigning)
if [[ "${ZOPTION_SKIP_PWA_VALIDATION:-0}" == "1" ]]; then
  BUBBLEWRAP_ARGUMENTS+=(--skipPwaValidation)
fi
npx --yes @bubblewrap/cli@1.25.0 "${BUBBLEWRAP_ARGUMENTS[@]}"

UNSIGNED_APK="${ANDROID_ROOT}/app-release-unsigned-aligned.apk"
if [[ ! -f "${UNSIGNED_APK}" ]]; then
  echo "Bubblewrap did not produce ${UNSIGNED_APK}." >&2
  exit 1
fi

if [[ -z "${ZOPTION_APK_STORE_PASSWORD:-}" ]]; then
  ZOPTION_APK_STORE_PASSWORD="$(security find-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w)"
fi
if [[ -z "${ZOPTION_APK_KEY_PASSWORD:-}" ]]; then
  ZOPTION_APK_KEY_PASSWORD="${ZOPTION_APK_STORE_PASSWORD}"
fi
export ZOPTION_APK_STORE_PASSWORD ZOPTION_APK_KEY_PASSWORD

ALIGNED_APK="${TEMPORARY_DIRECTORY}/aligned.apk"
SIGNED_APK="${TEMPORARY_DIRECTORY}/${RELEASE_FILENAME}"

"${ZIPALIGN}" -p -f 4 "${UNSIGNED_APK}" "${ALIGNED_APK}"
"${APKSIGNER}" sign \
  --ks "${KEYSTORE_PATH}" \
  --ks-key-alias "${KEYSTORE_ALIAS}" \
  --ks-pass env:ZOPTION_APK_STORE_PASSWORD \
  --key-pass env:ZOPTION_APK_KEY_PASSWORD \
  --v4-signing-enabled false \
  --out "${SIGNED_APK}" \
  "${ALIGNED_APK}"

"${ZIPALIGN}" -c -v 4 "${SIGNED_APK}" >/dev/null
"${APKSIGNER}" verify --verbose --print-certs "${SIGNED_APK}"

install -d -m 700 "${RELEASE_DIRECTORY}"
install -m 644 "${SIGNED_APK}" "${RELEASE_APK}"
CHECKSUM="$(shasum -a 256 "${RELEASE_APK}" | awk '{print $1}')"
printf '%s  %s\n' "${CHECKSUM}" "${RELEASE_FILENAME}" > "${RELEASE_CHECKSUM}"
chmod 644 "${RELEASE_CHECKSUM}"

printf 'Release APK: %s\nSHA-256: %s\n' "${RELEASE_APK}" "${CHECKSUM}"
