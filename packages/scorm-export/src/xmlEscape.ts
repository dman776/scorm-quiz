/**
 * Escapes text for safe inclusion in XML content or attribute values.
 * Used for every author-controlled string (title, description, ids) that
 * ends up in imsmanifest.xml so a title like `<script>` or `" onload=...`
 * cannot corrupt the manifest or inject markup.
 */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
