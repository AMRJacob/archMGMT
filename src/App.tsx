import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { isConfigured } from './lib/supabase.ts'
import Projects from './pages/Projects.tsx'
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
        {!isConfigured && <p className="notice">Not connected to a database yet. See README → Setup.</p>}
      </aside>
      <main className="content">
        <Routes>
          <Route path="/projects" element={<Projects />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/workload" element={<Workload />} />
          <Route path="/team" element={<Team />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </main>
    </div>
  )
}
