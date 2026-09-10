import { HashRouter, Route, Routes, Link } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard.js";
import { AssessmentEditor } from "./pages/AssessmentEditor.js";
import { LearnerPreviewPage } from "./pages/LearnerPreviewPage.js";
import { ScormDebugPreviewPage } from "./pages/ScormDebugPreviewPage.js";

export function App() {
  return (
    <HashRouter>
      <a href="#main-content" className="sq-skip-link">
        Skip to main content
      </a>
      <header className="sq-app-header">
        <Link to="/" className="sq-app-title">
          SCORM Quiz Builder
        </Link>
      </header>
      <main id="main-content" className="sq-app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/assessments/:id/edit" element={<AssessmentEditor />} />
          <Route path="/assessments/:id/preview" element={<LearnerPreviewPage />} />
          <Route path="/assessments/:id/scorm-debug" element={<ScormDebugPreviewPage />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
