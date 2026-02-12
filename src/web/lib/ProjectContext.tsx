import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Project } from "./api";

interface ProjectContextType {
  projects: Project[];
  selected: string | null;
  setSelected: (id: string | null) => void;
}

const ProjectContext = createContext<ProjectContextType>({
  projects: [],
  selected: null,
  setSelected: () => {},
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const initialProject = searchParams.get("project");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(initialProject);

  useEffect(() => {
    api.projects().then(setProjects).catch(() => {});
  }, []);

  return (
    <ProjectContext.Provider value={{ projects, selected, setSelected }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
