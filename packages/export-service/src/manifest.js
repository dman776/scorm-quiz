// @ts-check
/** SCORM 2004 4th Edition imsmanifest.xml generator. */
export function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
export function manifestId(raw) {
  let id = String(raw).replace(/[^A-Za-z0-9_.-]/g, '_');
  if (!/^[A-Za-z_]/.test(id)) id = 'ID_' + id;
  return id.slice(0, 120);
}
export function generateManifest(opts) {
  const id = manifestId(opts.identifier);
  const orgId = manifestId(id + '-ORG');
  const itemId = manifestId(id + '-ITEM');
  const resId = manifestId(id + '-RES');
  const title = xmlEscape(opts.title || 'Assessment');
  const version = xmlEscape(opts.version || '1.0');
  const launch = xmlEscape(opts.launch || 'index.html');
  const fileEls = opts.files.map((f) => `        <file href="${xmlEscape(f)}"/>`).join('\n');
  const mastery = typeof opts.masteryScaled === 'number'
    ? `
        <imsss:sequencing>
          <imsss:objectives>
            <imsss:primaryObjective objectiveID="PRIMARYOBJ" satisfiedByMeasure="true">
              <imsss:minNormalizedMeasure>${opts.masteryScaled.toFixed(4)}</imsss:minNormalizedMeasure>
            </imsss:primaryObjective>
          </imsss:objectives>
        </imsss:sequencing>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="${version}"
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
      <item identifier="${itemId}" identifierref="${resId}">
        <title>${title}</title>${mastery}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${resId}" type="webcontent" adlcp:scormType="sco" href="${launch}">
${fileEls}
    </resource>
  </resources>
</manifest>
`;
}
