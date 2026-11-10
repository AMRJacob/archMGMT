import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import ProjectSwitcher from './ProjectSwitcher.tsx'
import GlobalSearch from './GlobalSearch.tsx'
import { WhosHere } from './Presence.tsx'
import { useAuth } from '../auth/authContext.ts'
import { usingSampleData } from '../lib/data.ts'

/**
 * Phone navigation: the project and search across the top, the pages as icons along the bottom.
 * The everyday pages (Overview, Schedule, Notes, My To Do) get a tab each; the rest sit under More.
 */
const icon = (d: ReactNode) => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
const ICONS = {
  overview: icon(<><path d="M4 6h16M4 12h16M4 18h10" /><circle cx="19" cy="18" r="1.2" fill="currentColor" stroke="none" /></>),
  schedule: icon(<><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M3.5 9.5h17M8 2.8v3.4M16 2.8v3.4M7 13.5h5M10 17h7" /></>),
  board: icon(<><rect x="3.5" y="4" width="5" height="15" rx="1.2" /><rect x="9.5" y="4" width="5" height="10" rx="1.2" /><rect x="15.5" y="4" width="5" height="12.5" rx="1.2" /></>),
  notes: icon(<><path d="M6 3.5h9l3.5 3.5v13.5H6z" /><path d="M15 3.5V7h3.5M9 11h6.5M9 14.5h6.5M9 18h4" /></>),
  todo: icon(<><path d="M4.5 6.5l1.8 1.8 3-3.3M4.5 13.5l1.8 1.8 3-3.3" /><path d="M12.5 7h7M12.5 14h7M5 20h14.5" /></>),
  more: icon(<><circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" /></>),
  projects: icon(<><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>),
  team: icon(<><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16 14.6c2.4-.2 4.1 1.3 4.6 4" /></>),
  settings: icon(<><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5" /></>),
}

const TABS = [
  { to: '/overview', label: 'Overview', icon: ICONS.overview },
  { to: '/schedule', label: 'Schedule', icon: ICONS.schedule },
  { to: '/notes', label: 'Notes', icon: ICONS.notes },
  { to: '/todo', label: 'To Do', icon: ICONS.todo },
]
const MORE = [
  { to: '/board', label: 'Board', icon: ICONS.board },
  { to: '/', label: 'All Projects', icon: ICONS.projects, end: true },
  { to: '/team', label: 'Team & Workload', icon: ICONS.team },
  { to: '/settings', label: 'Settings & Data', icon: ICONS.settings },
]

export function MobileTop() {
  return (
    <header className="mtop no-print">
      <div className="brand mbrand" aria-label="archMGMT"><span className="arch">a</span><span className="mgmt">M</span></div>
      <div className="mtop-project"><ProjectSwitcher /></div>
      <WhosHere />
      <GlobalSearch />
    </header>
  )
}

export function MobileTabs() {
  const [more, setMore] = useState(false)
  const { pathname } = useLocation()
  const { session, signOut } = useAuth()
  // Moving to another page closes the More sheet.
  const [at, setAt] = useState(pathname)
  if (at !== pathname) { setAt(pathname); setMore(false) }
  const inMore = MORE.some((m) => (m.end ? pathname === m.to : pathname.startsWith(m.to)))
  return (
    <>
      {more && (
        <div className="msheet-back no-print" onClick={() => setMore(false)}>
          <div className="msheet" role="dialog" aria-label="More pages" onClick={(e) => e.stopPropagation()}>
            <div className="msheet-grip" />
            <nav className="msheet-nav">
              {MORE.map((m) => (
                <NavLink key={m.to} to={m.to} end={m.end}>{m.icon}<span>{m.label}</span></NavLink>
              ))}
            </nav>
            {usingSampleData && <p className="muted small msheet-note">Data is saved in this browser only until the shared database is connected.</p>}
            {session && (
              <div className="msheet-foot">
                <span className="muted small">{session.user.email}</span>
                <button className="btn" onClick={signOut}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      )}
      <nav className="mtabs no-print" aria-label="Pages">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to}>{t.icon}<span>{t.label}</span></NavLink>
        ))}
        <button className={inMore || more ? 'active' : ''} onClick={() => setMore(!more)} aria-expanded={more}>{ICONS.more}<span>More</span></button>
      </nav>
    </>
  )
}
