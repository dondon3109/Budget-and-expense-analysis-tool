import { createPrivateKey, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OTA_CERTIFICATE_SHA256 =
  "0981ef1b233b9eb5b2de46c675effda0c50ade8724c04ac9d4d478c5ba2ed2e6";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const certificatePath = resolve(mobileRoot, "certs/ota-production.pem");
const certificate = new X509Certificate(readFileSync(certificatePath));
const actualFingerprint = certificate.fingerprint256.replaceAll(":", "").toLowerCase();

if (actualFingerprint !== OTA_CERTIFICATE_SHA256) {
  throw new Error(`OTA certificate fingerprint mismatch: ${actualFingerprint}`);
}
if (certificate.subject !== certificate.issuer || !certificate.verify(certificate.publicKey)) {
  throw new Error("OTA certificate is not a valid self-signed trust anchor.");
}
if (
  Date.parse(certificate.validFrom) > Date.now() ||
  Date.parse(certificate.validTo) <= Date.now()
) {
  throw new Error("OTA certificate is outside its validity window.");
}
if (
  certificate.publicKey.asymmetricKeyType !== "rsa" ||
  (certificate.publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
) {
  throw new Error("OTA certificate must use an RSA key of at least 2048 bits.");
}

const privateKeyPath = process.env.OTA_PRIVATE_KEY_PATH;
if (privateKeyPath) {
  const privateKey = createPrivateKey(readFileSync(privateKeyPath));
  if (!certificate.checkPrivateKey(privateKey)) {
    throw new Error("OTA private key does not match the pinned certificate.");
  }
}

const androidManifestPath = process.env.OTA_ANDROID_MANIFEST_PATH;
if (androidManifestPath) {
  const manifest = readFileSync(androidManifestPath, "utf8");
  const embeddedCertificate = manifest.match(
    /<meta-data android:name="expo\.modules\.updates\.CODE_SIGNING_CERTIFICATE" android:value="([^"]+)"\s*\/>/u,
  )?.[1];
  const signingMetadata = manifest.match(
    /<meta-data android:name="expo\.modules\.updates\.CODE_SIGNING_METADATA" android:value="([^"]+)"\s*\/>/u,
  )?.[1];
  if (!embeddedCertificate || !signingMetadata) {
    throw new Error("Generated Android manifest is missing OTA signing trust metadata.");
  }

  const embedded = new X509Certificate(decodeXmlAttribute(embeddedCertificate));
  const embeddedFingerprint = embedded.fingerprint256.replaceAll(":", "").toLowerCase();
  if (embeddedFingerprint !== OTA_CERTIFICATE_SHA256) {
    throw new Error(`Android manifest pins the wrong OTA certificate: ${embeddedFingerprint}`);
  }

  const metadata = JSON.parse(decodeXmlAttribute(signingMetadata));
  if (metadata.keyid !== "main" || metadata.alg !== "rsa-v1_5-sha256") {
    throw new Error("Android manifest pins the wrong OTA signing key or algorithm.");
  }
}

console.log(
  `OTA signing certificate verified: sha256=${actualFingerprint} validTo=${certificate.validTo}`,
);

function decodeXmlAttribute(value) {
  return value
    .replaceAll("&#xD;", "\r")
    .replaceAll("&#xA;", "\n")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
