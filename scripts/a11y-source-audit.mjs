/**
 * Source-level accessibility audit.
 *
 * axe-core can only tell us about the app-route surfaces once a browser can reach them, and
 * that needs a local Supabase stack. This catches the same classes of defect statically, so
 * they can be found and fixed now and the browser pass has less to discover:
 *
 *   - an interactive element with no accessible name (icon-only button or link)
 *   - a form control with no label
 *   - focusable content inside an aria-hidden subtree, which is the bug that made the savings
 *     switch unreachable and would have inerted five dialogs
 *   - a positive tabindex
 *   - an image with no alt attribute
 *
 * It errs towards silence: anything it cannot resolve statically (a name built from a variable,
 * a control wrapped in a label) is treated as fine rather than reported, because a scanner that
 * cries wolf gets ignored. Findings are candidates to check by eye, not verdicts.
 *
 * Run directly for a report:  node scripts/a11y-source-audit.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const CONTROLS = new Set(["input", "select", "textarea"]);
const LINK_TAGS = new Set(["a", "Link", "NavLink"]);
const FOCUSABLE_TAGS = new Set(["button", "a", "Link", "NavLink", "input", "select", "textarea"]);
const CONTROL_TYPES_WITHOUT_LABELS = new Set(["hidden", "submit", "button", "image", "reset"]);

function collectSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "tests" || entry.name === "node_modules") continue;
        walk(path);
      } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
        out.push(path);
      }
    }
  };
  walk(root);
  return out;
}

function attributesOf(node) {
  const map = new Map();
  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name)) {
      map.set(property.name.text, property.initializer ?? null);
    }
  }
  return map;
}

function tagOf(node) {
  const name = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return name.getText();
}

function openingOf(node) {
  return ts.isJsxElement(node) ? node.openingElement : node;
}

/**
 * Resolves a JSX attribute to a literal value, or undefined when it is dynamic.
 * A bare attribute resolves to true, matching JSX semantics for aria-hidden and friends.
 */
function staticValue(initializer) {
  if (initializer === null || initializer === undefined) return true;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer)) {
    const expression = initializer.expression;
    if (!expression) return true;
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text;
    }
    if (ts.isNumericLiteral(expression)) return Number(expression.text);
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  }
  return undefined;
}

/** Does the element's own JSX subtree supply a name, and can we be sure either way? */
function nameEvidence(node) {
  let text = "";
  let unknown = false;
  let nestedAlt = false;

  const visit = (child) => {
    if (ts.isJsxText(child)) {
      text += child.text;
      return;
    }
    if (ts.isJsxExpression(child)) {
      const expression = child.expression;
      if (!expression) return;
      if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
        text += expression.text;
        return;
      }
      unknown = true;
      return;
    }
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      if (tagOf(child) === "img") {
        const attributes = attributesOf(openingOf(child));
        if (attributes.has("alt")) nestedAlt = true;
        else unknown = true;
        return;
      }
      // Recurse: a name is very often inside a nested <span>, which the first version of this
      // scanner missed. That produced 33 candidates on pages axe had already cleared, which is
      // what a scanner bug looks like rather than what 33 real defects look like.
      if (ts.isJsxElement(child)) {
        for (const grandchild of child.children) visit(grandchild);
      }
    }
  };

  if (ts.isJsxElement(node)) {
    for (const child of node.children) visit(child);
  }

  return { text: text.trim(), unknown, nestedAlt };
}

function isFocusable(tag, attributes) {
  if (FOCUSABLE_TAGS.has(tag)) {
    if (tag === "input") return staticValue(attributes.get("type")) !== "hidden";
    return true;
  }
  const tabIndex = attributes.get("tabindex") ?? attributes.get("tabIndex");
  if (tabIndex === undefined) return false;
  const value = staticValue(tabIndex);
  return !(typeof value === "number" && value < 0);
}

export function auditSource(root) {
  const findings = [];
  const report = (file, node, check, detail) => {
    const { line } = ts.getLineAndCharacterOfPosition(
      node.getSourceFile(),
      node.getStart(node.getSourceFile()),
    );
    findings.push({ file, line: line + 1, check, detail });
  };

  for (const file of collectSourceFiles(root)) {
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const short = relative(process.cwd(), file);

    const check = (node, ancestors) => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = tagOf(node);
        const attributes = attributesOf(openingOf(node));
        const hasNameAttribute =
          attributes.has("aria-label") ||
          attributes.has("aria-labelledby") ||
          attributes.has("title");

        // 1. Interactive element with no accessible name.
        const isInteractive = tag === "button" || LINK_TAGS.has(tag);
        if (isInteractive && !hasNameAttribute) {
          const evidence = nameEvidence(node);
          const named = evidence.text.length > 0 || evidence.nestedAlt;
          if (!named && !evidence.unknown) {
            report(short, node, "no-accessible-name", `<${tag}> has no label and no text`);
          }
        }

        // 2. Form control with no label. A wrapping <label> or a matching htmlFor cannot be
        //    confirmed from here, so only flag when there is no id either.
        if (CONTROLS.has(tag)) {
          const type = staticValue(attributes.get("type"));
          const skipType = typeof type === "string" && CONTROL_TYPES_WITHOUT_LABELS.has(type);
          const wrapped = ancestors.includes("label");
          if (!skipType && !hasNameAttribute && !attributes.has("id") && !wrapped) {
            report(short, node, "control-without-label", `<${tag}> has no aria-label, id or label`);
          }
        }

        // 3. Focusable content inside an aria-hidden subtree.
        const hidden = attributes.get("aria-hidden");
        const hiddenValue = hidden === undefined ? undefined : staticValue(hidden);
        if (hiddenValue === true || hiddenValue === "true") {
          const offenders = [];
          const scan = (candidate) => {
            if (ts.isJsxElement(candidate) || ts.isJsxSelfClosingElement(candidate)) {
              const childTag = tagOf(candidate);
              const childAttributes = attributesOf(openingOf(candidate));
              if (isFocusable(childTag, childAttributes)) offenders.push(childTag);
              ts.forEachChild(candidate, scan);
            }
          };
          ts.forEachChild(node, scan);
          if (offenders.length > 0) {
            report(
              short,
              node,
              "focusable-inside-aria-hidden",
              `aria-hidden subtree contains <${offenders[0]}>`,
            );
          }
        }

        // 4. Positive tabindex.
        const tabIndex = attributes.get("tabIndex") ?? attributes.get("tabindex");
        if (tabIndex !== undefined) {
          const value = staticValue(tabIndex);
          if (typeof value === "number" && value > 0) {
            report(short, node, "positive-tabindex", `tabIndex={${value}}`);
          }
        }

        // 5. Image without alt.
        if (tag === "img" && !attributes.has("alt")) {
          report(short, node, "img-without-alt", "<img> has no alt attribute");
        }
      }

      const nextAncestors = ts.isJsxElement(node) ? [...ancestors, tagOf(node)] : ancestors;
      ts.forEachChild(node, (child) => check(child, nextAncestors));
    };

    check(source, []);
  }

  return findings;
}

// Resolve the entry point rather than string-matching it: importing this module from a test
// must not trip the CLI branch, and process.argv[1] is not a reliable signal on its own.
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  const findings = auditSource("apps/web/src");
  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line}  [${finding.check}] ${finding.detail}`);
  }
  console.log(`
${findings.length} candidate(s) to review by eye.`);
  process.exit(findings.length > 0 ? 2 : 0);
}
