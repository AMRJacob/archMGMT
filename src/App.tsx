import { useEffect } from 'react'
import { AuthProvider, CreatePassword, SignIn } from './auth/Auth.tsx'
import { useAuth } from './auth/authContext.ts'
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import PageEdge from './components/PageEdge.tsx'
import GlobalSearch from './components/GlobalSearch.tsx'
import { Notices, PresenceProvider, WhosHere } from './components/Presence.tsx'
import { FIT_WIDTH, usePageWidth } from './lib/prefs.ts'
import ProjectProvider from './components/ProjectProvider.tsx'
import ProjectSwitcher from './components/ProjectSwitcher.tsx'
import { usingSampleData } from './lib/data.ts'
import { supabase } from './lib/supabase.ts'
import { useProject } from './lib/projectContext.ts'
import Projects from './pages/Projects.tsx'
import ProjectDetail from './pages/ProjectDetail.tsx'
import Notes from './pages/Notes.tsx'
import Schedule from './pages/Schedule.tsx'
import Team from './pages/Team.tsx'
import Settings from './pages/Settings.tsx'
import MyTodo from './pages/MyTodo.tsx'
import { MobileTabs, MobileTop } from './components/MobileNav.tsx'
import { usePhone } from './lib/phone.ts'

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

/** Shared database: sign in first. Browser-only mode: straight in. */
function Gate() {
  const { session, loading, needsPassword } = useAuth()
  if (!usingSampleData) {
    if (loading) return <div className="signin"><p className="muted">Loading…</p></div>
    if (!session) return <SignIn />
    if (needsPassword) return <CreatePassword />
  }
  return <Shell />
}

/**
 * Tells the database this person has the app open (for "Active …" in Settings → Access), at most about
 * once an hour per browser, checked when the app opens and every ten minutes while it stays open.
 */
function useNoteActivity(email: string | undefined) {
  useEffect(() => {
    if (!supabase || !email) return
    const KEY = 'archmgmt.activityNoted'
    const ping = () => {
      let last = 0
      try { last = Number(localStorage.getItem(KEY) ?? 0) } catch { /* private mode */ }
      if (Date.now() - last < 55 * 60 * 1000) return
      try { localStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ }
      void supabase!.rpc('note_activity')
    }
    ping()
    const id = window.setInterval(ping, 10 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [email])
}

function Shell() {
  const { session, signOut } = useAuth()
  const pageW = usePageWidth()
  const phone = usePhone()
  useNoteActivity(session?.user.email)
  return (
    <ProjectProvider>
      <PresenceProvider>
      <div className={`shell${phone ? ' phone' : ''}`}>
        {phone && <MobileTop />}
        {!phone && <aside className="sidebar no-print">
          <div className="brand" aria-label="archMGMT"><span className="arch">arch</span><span className="mgmt">MGMT</span></div>
          <GlobalSearch />
          {/* The project you're in, with its pages, as one group. */}
          <section className="project-nav" aria-label="This project">
            <ProjectSwitcher />
            <WhosHere />
            <nav>
              <NavLink to="/overview">Overview</NavLink>
              <NavLink to="/schedule">Schedule</NavLink>
              <NavLink to="/board">Board</NavLink>
              <NavLink to="/notes">Meeting Notes</NavLink>
            </nav>
          </section>
          {/* Personal: your own work across every project. */}
          <nav className="me-nav" aria-label="Me">
            <NavLink to="/todo">My To Do</NavLink>
          </nav>
          <div className="sidebar-foot">
            {usingSampleData && (
              <p className="notice">
                <strong>Browser storage</strong>
                Data is saved in this browser only until the shared database is connected. Back it up from Settings.
              </p>
            )}
            {/* Office-wide pages, apart from the project. */}
            <nav className="office-nav" aria-label="Office">
              <span className="nav-label">Office</span>
              <NavLink to="/" end>All Projects</NavLink>
              <NavLink to="/team">Team &amp; Workload</NavLink>
              <NavLink to="/settings">Settings &amp; Data</NavLink>
            </nav>
            {session && (
              <div className="signout">
                <span>{session.user.email}</span>
                <button className="linkbtn" onClick={signOut}>Sign out</button>
              </div>
            )}
          </div>
        </aside>}
        <main className="content" style={pageW === 'full' || phone ? undefined : { maxWidth: pageW === 'fit' ? FIT_WIDTH : pageW }}>
          <PageEdge />
          <Routes>
            <Route path="/" element={<Projects />} />
            <Route path="/overview" element={<ProjectDetail />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/board" element={<Schedule />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/team" element={<Team />} />
            <Route path="/todo" element={<MyTodo />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/:section" element={<Settings />} />
            <Route path="/wishlist" element={<Navigate to="/settings/wishlist" replace />} />
            <Route path="/projects/:id" element={<OpenProject />} />
            <Route path="/workload" element={<Navigate to="/team" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {phone && <MobileTabs />}
        <Notices />
      </div>
      </PresenceProvider>
    </ProjectProvider>
  )
}

/** Old-style link to a project: make it current, then show its overview. */
function OpenProject() {
  const { id } = useParams()
  const { select } = useProject()
  useEffect(() => { if (id) select(id) }, [id, select])
  return <Navigate to="/overview" replace />
}
