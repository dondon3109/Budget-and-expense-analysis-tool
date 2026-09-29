/**
 * Structural checks for a public page’s JSON-LD graph: one linked, canonical WebSite
 * node, the page node its route calls for, and none of the business, pricing, review, or
 * navigation markup Zoption cannot substantiate (docs/seo.md). finalize-build.mjs runs it on
 * every built page and scripts/smoke-production.mjs on the live ones.
 */
import release from "@zoption/web-common/android-release.json" with { type: "json" };

const FORBIDDEN_SCHEMA_TYPES = new Set([
  "Organization",
  "Person",
  "Offer",
  "AggregateRating",
  "Review",
  "BreadcrumbList",
  "LocalBusiness",
  "SearchAction",
]);
const FORBIDDEN_SCHEMA_PROPERTIES = new Set([
  "sameAs",
  "screenshot",
  "softwareVersion",
  "price",
  "priceCurrency",
  "aggregateRating",
  "review",
  "offers",
]);

function structuredDataAssert(condition, message) {
  if (!condition) throw new Error(`Structured data verification failed: ${message}`);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectNestedIds(value, ids) {
  if (Array.isArray(value)) {
    for (const item of value) collectNestedIds(item, ids);
    return;
  }
  if (!isRecord(value)) return;

  if (typeof value["@id"] === "string") ids.add(value["@id"]);
  for (const nestedValue of Object.values(value)) collectNestedIds(nestedValue, ids);
}

function rejectUnsupportedSchemaClaims(value, { allowAndroidSoftwareApplication = false } = {}) {
  if (Array.isArray(value)) {
    for (const item of value) {
      rejectUnsupportedSchemaClaims(item, { allowAndroidSoftwareApplication });
    }
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, nestedValue] of Object.entries(value)) {
    structuredDataAssert(
      !FORBIDDEN_SCHEMA_PROPERTIES.has(key) ||
        (allowAndroidSoftwareApplication && key === "softwareVersion"),
      `must not include unsupported ${key} markup.`,
    );
    if (key === "@type") {
      const types = Array.isArray(nestedValue) ? nestedValue : [nestedValue];
      for (const type of types) {
        structuredDataAssert(
          typeof type !== "string" || !FORBIDDEN_SCHEMA_TYPES.has(type),
          `must not include unsupported ${type} markup.`,
        );
        structuredDataAssert(
          allowAndroidSoftwareApplication || type !== "SoftwareApplication",
          "must not include unsupported SoftwareApplication markup.",
        );
      }
    }
    rejectUnsupportedSchemaClaims(nestedValue, { allowAndroidSoftwareApplication });
  }
}

export function assertPublicStructuredDataGraph(
  structuredData,
  { path, canonical, dateModified, expectedStructuredData },
) {
  structuredDataAssert(isRecord(structuredData), `${path} must contain a graph object.`);
  structuredDataAssert(
    structuredData["@context"] === "https://schema.org",
    `${path} must use the Schema.org context.`,
  );
  structuredDataAssert(
    Array.isArray(structuredData["@graph"]) && structuredData["@graph"].length > 0,
    `${path} must contain a non-empty graph.`,
  );
  if (expectedStructuredData) {
    structuredDataAssert(
      JSON.stringify(structuredData) === JSON.stringify(expectedStructuredData),
      `${path} graph does not match its route metadata.`,
    );
  }

  const nodes = structuredData["@graph"];
  structuredDataAssert(nodes.every(isRecord), `${path} graph must contain only object nodes.`);
  const nodeIds = nodes.map((node) => node["@id"]);
  structuredDataAssert(
    nodeIds.every((id) => typeof id === "string" && id.length > 0),
    `${path} graph nodes must have stable IDs.`,
  );
  structuredDataAssert(
    new Set(nodeIds).size === nodeIds.length,
    `${path} graph nodes must not duplicate IDs.`,
  );

  const references = new Set();
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node)) {
      if (key !== "@id") collectNestedIds(value, references);
    }
  }
  for (const reference of references) {
    structuredDataAssert(nodeIds.includes(reference), `${path} has an unresolved ${reference} ID.`);
  }

  rejectUnsupportedSchemaClaims(structuredData, {
    allowAndroidSoftwareApplication: path === "/install",
  });

  const siteOrigin = new URL(canonical).origin;
  const websiteId = `${siteOrigin}/#website`;
  const websiteNodes = nodes.filter((node) => node["@type"] === "WebSite");
  structuredDataAssert(websiteNodes.length === 1, `${path} must contain one WebSite node.`);
  structuredDataAssert(
    websiteNodes[0]["@id"] === websiteId && websiteNodes[0].url === siteOrigin,
    `${path} WebSite node must use the canonical website ID and URL.`,
  );
  structuredDataAssert(
    websiteNodes[0].inLanguage === "en",
    `${path} WebSite node must declare English content.`,
  );

  if (path === "/") {
    const applications = nodes.filter((node) => node["@type"] === "WebApplication");
    structuredDataAssert(
      applications.length === 1,
      "Homepage must contain one WebApplication node.",
    );
    const application = applications[0];
    structuredDataAssert(
      application["@id"] === `${siteOrigin}/#webapplication` && application.url === canonical,
      "Homepage WebApplication must use its canonical ID and URL.",
    );
    structuredDataAssert(
      application.inLanguage === "en" && application.isPartOf?.["@id"] === websiteId,
      "Homepage WebApplication must be English and link to the WebSite.",
    );
    structuredDataAssert(
      Array.isArray(application.featureList) && application.featureList.length === 4,
      "Homepage WebApplication must describe the four visible feature claims.",
    );
    return;
  }

  const pages = nodes.filter((node) => node["@type"] === "WebPage");
  structuredDataAssert(pages.length === 1, `${path} must contain one WebPage node.`);
  const page = pages[0];
  structuredDataAssert(
    page["@id"] === `${canonical}#webpage` && page.url === canonical,
    `${path} WebPage must use its canonical ID and URL.`,
  );
  structuredDataAssert(
    page.inLanguage === "en" && page.isPartOf?.["@id"] === websiteId,
    `${path} WebPage must be English and link to the WebSite.`,
  );
  structuredDataAssert(
    dateModified
      ? page.dateModified === dateModified
      : typeof page.dateModified === "string" && /^\d{4}-\d{2}-\d{2}$/.test(page.dateModified),
    `${path} WebPage dateModified must match its maintained content date.`,
  );

  const softwareApplications = nodes.filter((node) => node["@type"] === "SoftwareApplication");
  if (path === "/install") {
    structuredDataAssert(
      softwareApplications.length === 1,
      "/install must contain one SoftwareApplication node.",
    );
    const application = softwareApplications[0];
    structuredDataAssert(
      page.mainEntity?.["@id"] === application["@id"],
      "/install WebPage must identify the Android application as its main entity.",
    );
    structuredDataAssert(
      typeof application.operatingSystem === "string" &&
        application.operatingSystem.startsWith("Android") &&
        typeof application.softwareVersion === "string" &&
        /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(application.softwareVersion) &&
        typeof application.downloadUrl === "string" &&
        application.downloadUrl === release.downloadPath &&
        application.downloadUrl.endsWith(`/${release.filename}`) &&
        typeof application.fileSize === "string" &&
        /^\d+ bytes$/.test(application.fileSize),
      "/install SoftwareApplication must match the maintained Android release.",
    );
  } else {
    structuredDataAssert(
      softwareApplications.length === 0,
      `${path} must not include SoftwareApplication markup.`,
    );
  }
}
