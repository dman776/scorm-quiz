import type { Assessment } from "@scorm-quiz/schemas";
import { xmlEscape } from "./xmlEscape.js";

export interface ManifestOptions {
  /** The launch file's path relative to the package root (e.g. "index.html"). */
  launchFile: string;
  /** Every file path (relative to package root) that must be listed as a
   * <file> in the resource so the manifest fully declares package contents. */
  filePaths: string[];
  /** A stable, package-unique identifier (not the assessment's internal id,
   * which authors may reuse across versions). */
  manifestIdentifier: string;
}

/**
 * Generates a SCORM 2004 4th Edition imsmanifest.xml for a single-SCO
 * package. All author-controlled text is XML-escaped. Multi-SCO packages
 * (multiple <item>/<resource> pairs) are an intentional non-goal of this
 * generator for now — see ROADMAP.md — so this always emits exactly one
 * organization, one item, and one resource.
 */
export function generateManifest(assessment: Assessment, options: ManifestOptions): string {
  const title = xmlEscape(assessment.lmsTitle || assessment.title);
  const orgId = "ORG-1";
  const itemId = "ITEM-1";
  const resourceId = "RES-1";

  const masteryScore = assessment.settings.scorm.masteryScore;
  const sequencing =
    masteryScore !== undefined
      ? `
        <imsss:sequencing>
          <imsss:objectives>
            <imsss:primaryObjective objectiveID="PRIMARY-OBJECTIVE" satisfiedByMeasure="true">
              <imsss:minNormalizedMeasure>${masteryScore}</imsss:minNormalizedMeasure>
            </imsss:primaryObjective>
          </imsss:objectives>
        </imsss:sequencing>`
      : "";

  const fileEntries = options.filePaths
    .map((path) => `      <file href="${xmlEscape(path)}"/>`)
    .join("\n");

  return `<?xml version="1.0" standalone="no"?>
<manifest identifier="${xmlEscape(options.manifestIdentifier)}" version="1"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
  xmlns:imsss="http://www.imsglobal.org/xsd/imsss"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd
                       http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd
                       http://www.adlnet.org/xsd/adlseq_v1p3 adlseq_v1p3.xsd
                       http://www.adlnet.org/xsd/adlnav_v1p3 adlnav_v1p3.xsd
                       http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
  <organizations default="${orgId}">
    <organization identifier="${orgId}">
      <title>${title}</title>
      <item identifier="${itemId}" identifierref="${resourceId}">
        <title>${title}</title>${sequencing}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${resourceId}" type="webcontent" adlcp:scormType="sco" href="${xmlEscape(options.launchFile)}">
${fileEntries}
    </resource>
  </resources>
</manifest>
`;
}
