/**
 * The SCORM 2004 4th Edition RTE API surface, as exposed by the LMS on
 * window.API_1484_11 (or an ancestor/opener window). All methods return
 * strings per the SCORM RTE spec ("true"/"false", or the requested value).
 */
export interface Api1484_11 {
  Initialize(parameter: ""): "true" | "false";
  Terminate(parameter: ""): "true" | "false";
  GetValue(element: string): string;
  SetValue(element: string, value: string): "true" | "false";
  Commit(parameter: ""): "true" | "false";
  GetLastError(): string;
  GetErrorString(errorCode: string): string;
  GetDiagnostic(errorCode: string): string;
}

declare global {
  interface Window {
    API_1484_11?: Api1484_11;
  }
}
