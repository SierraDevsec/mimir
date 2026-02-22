import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { ProjectProvider } from "./lib/ProjectContext";
import { WebSocketProvider } from "./lib/WebSocketContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Context from "./pages/Context";
import Tasks from "./pages/Tasks";
import Activity from "./pages/Activity";
import Swarm from "./pages/Swarm";
import Observations from "./pages/Observations";
import Skills from "./pages/Skills";
import Curation from "./pages/Curation";
import Flows from "./pages/Flows";

export default function App() {
  return (
    <ErrorBoundary>
      <ProjectProvider>
        <WebSocketProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="agents" element={<Agents />} />
              <Route path="context" element={<Context />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="activity" element={<Activity />} />
              <Route path="swarm" element={<Swarm />} />
              <Route path="observations" element={<Observations />} />
              <Route path="skills" element={<Skills />} />
              <Route path="curation" element={<Curation />} />
              <Route path="flows" element={<Flows />} />
            </Route>
          </Routes>
        </WebSocketProvider>
      </ProjectProvider>
    </ErrorBoundary>
  );
}
