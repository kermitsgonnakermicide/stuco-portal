// lib/sanitize.ts
// Event descriptions are the one field admins can enter as rich text.
// Everything else (titles, names, reasons) is treated as plain text and
// escaped at render time by React's default JSX behavior - never
// dangerouslySetInnerHTML. Rich text is sanitized on WRITE (not just on
// read) with an allowlist, so stored data is safe even if a future page
// forgets to sanitize on the way out.

import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "ul", "ol", "li", "a", "h3", "h4", "blockquote",
];

export function sanitizeEventDescription(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "rel"],
    },
    // Force safe rel/target on links, block javascript: and data: URIs.
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
    allowedSchemes: ["https", "mailto"],
    disallowedTagsMode: "discard",
  });
}
