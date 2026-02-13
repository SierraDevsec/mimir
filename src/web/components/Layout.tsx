import { useEffect } from "react";
import { NavLink, Outlet, useSearchParams } from "react-router-dom";
import { RiDashboardLine, RiRobotLine, RiTaskLine, RiTeamLine, RiEyeLine, RiMagicLine, RiShieldCheckLine } from "react-icons/ri";
import { useProject } from "../lib/ProjectContext";

const links = [
  { to: "/", label: "Dashboard", icon: RiDashboardLine },
  { to: "/agents", label: "Agents", icon: RiRobotLine },
  { to: "/swarm", label: "Swarm", icon: RiTeamLine },
  { to: "/tasks", label: "Tasks", icon: RiTaskLine },
  { to: "/observations", label: "Observations", icon: RiEyeLine },
  { to: "/skills", label: "Skills", icon: RiMagicLine },
  { to: "/curation", label: "Curation", icon: RiShieldCheckLine },
];

export default function Layout() {
  const { projects, selected, setSelected } = useProject();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get("embed") === "true";

  useEffect(() => {
    if (isEmbed) {
      document.documentElement.style.background = "transparent";
      document.body.style.background = "transparent";
      return () => {
        document.documentElement.style.background = "";
        document.body.style.background = "";
      };
    }
  }, [isEmbed]);

  if (isEmbed) {
    return (
      <div className="h-screen bg-transparent">
        <main className="h-full overflow-hidden">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)]">
      <nav className="w-56 bg-zinc-950 border-r border-zinc-800 flex flex-col">
        <div className="p-4 pb-6">
          <h1 className="text-lg font-semibold tracking-wide flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="w-5 h-5" />
            <span className="text-emerald-400">Mimir</span>
          </h1>
        </div>

        <div className="flex-1 px-3 space-y-0.5">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-800/60 text-emerald-400"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                }`
              }
            >
              <l.icon className="w-4 h-4" />
              {l.label}
            </NavLink>
          ))}
        </div>

        <div className="p-3 border-t border-zinc-800">
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
            className="cl-select w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </nav>

      <main className="flex-1 p-6 overflow-auto bg-[var(--bg-primary)]">
        <Outlet />
      </main>
    </div>
  );
}
