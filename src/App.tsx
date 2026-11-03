import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { resetSampleData, usingSampleData } from './lib/data.ts'
import Projects from './pages/Projects.tsx'
import ProjectDetail from './pages/ProjectDetail.tsx'
import Schedule from './pages/Schedule.tsx'
import Workload from './pages/Workload.tsx'
import Team from './pages/Team.tsx'

const nav = [
  { to: '/projects', label: 'Projects' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/workload', label: 'Workload' },
  { to: '/team', label: 'Team' },
]

export default function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          arch<span>MGMT</span>
        </div>
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        {usingSampleData && (
          <div className="notice">
            <strong>Sample data</strong>
            Not connected to the shared database yet. Changes are saved in this browser only.
            <button
              onClick={() => {
                if (window.confirm('Reset to the original sample data? Your changes in this browser will be lost.')) {
                  resetSampleData()
                  window.location.reload()
                }
              }}
            >
              Reset sample data
            </button>
          </div>
        )}
      </aside>
      <main className="content">
        <Routes>
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/workload" element={<Workload />} />
          <Route path="/team" element={<Team />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </main>
    </div>
  )
}
