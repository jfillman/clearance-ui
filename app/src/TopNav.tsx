import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { Button, FilterSelect, fontBody, fontScale, ProductMark, useClearanceRead, useClearanceTokens, type ClearanceTokens } from '../../src/kit';
import type { WebSession } from './session';

// The shell's chrome: the product mark, one link per Clearance page, the app picker (which stands where Backstage's
// catalog stands: it scopes the pages that take an app) and who is signed in. The router owns the page; `?app=` is the
// picked app and rides along every nav link, so the pages and a pasted URL agree.

export const PAGES = [
  { path: '/clearances', label: 'Clearances' },
  { path: '/evidence', label: 'Evidence' },
  { path: '/exceptions', label: 'Exceptions' },
  { path: '/attestations', label: 'Attestations' },
  { path: '/map', label: 'Map' },
  { path: '/policy', label: 'Policy' },
] as const;

const useStyles = makeStyles<Theme, { t: ClearanceTokens }>(() => ({
  bar: { display: 'flex', alignItems: 'center', gap: 20, padding: '0 24px', height: 52, background: ({ t }) => t.panel, borderBottom: ({ t }) => `1px solid ${t.line}`, fontFamily: fontBody, position: 'sticky', top: 0, zIndex: 10 },
  brand: { display: 'flex', alignItems: 'center', gap: 8, color: ({ t }) => t.textHi, fontSize: fontScale.lg, fontWeight: 600, textDecoration: 'none' },
  nav: { display: 'flex', alignItems: 'stretch', gap: 4, height: '100%', flex: 1, minWidth: 0 },
  link: {
    display: 'flex', alignItems: 'center', padding: '0 12px', color: ({ t }) => t.textLo, fontSize: fontScale.md, textDecoration: 'none', borderBottom: '2px solid transparent', marginBottom: -1,
    '&:hover': { color: ({ t }) => t.textHi },
  },
  active: { color: ({ t }) => t.textHi, borderBottomColor: ({ t }) => t.amber },
  right: { display: 'flex', alignItems: 'center', gap: 14, color: ({ t }) => t.textLo, fontSize: fontScale.sm },
}));

/** The apps Clearance has seen a change for: GET /v1/clearances/counts?by=app. */
function useApps(): string[] {
  const read = useClearanceRead();
  const [apps, setApps] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    read
      .get<{ items: Array<{ key: string | null; count: number }> }>('/v1/clearances/counts', { by: 'app' })
      .then(r => live && setApps(r.items.map(i => i.key).filter((k): k is string => !!k).sort()))
      .catch(() => live && setApps([]));
    return () => {
      live = false;
    };
  }, [read]);
  return apps;
}

export function AppPicker() {
  const apps = useApps();
  const [params, setParams] = useSearchParams();
  const app = params.get('app') ?? '';
  const options = [{ value: '', label: 'All apps' }, ...(app && !apps.includes(app) ? [{ value: app, label: app }] : []), ...apps.map(a => ({ value: a, label: a }))];
  return (
    <FilterSelect
      label="App"
      value={app}
      options={options}
      onChange={v => {
        const next = new URLSearchParams(params);
        if (v) next.set('app', v);
        else next.delete('app');
        setParams(next);
      }}
    />
  );
}

export function TopNav({ session, onSignOut }: { session: WebSession | null; onSignOut: () => void }) {
  const t = useClearanceTokens();
  const c = useStyles({ t });
  const { search } = useLocation();
  const app = new URLSearchParams(search).get('app');
  const keep = app ? `?app=${encodeURIComponent(app)}` : '';
  const navigate = useNavigate();
  return (
    <header className={c.bar}>
      <a className={c.brand} href="/clearances" onClick={e => { e.preventDefault(); navigate(`/clearances${keep}`); }}>
        <ProductMark product="clearance" size={24} /> Clearance
      </a>
      <nav className={c.nav} aria-label="Clearance pages">
        {PAGES.map(p => (
          <NavLink key={p.path} to={`${p.path}${keep}`} className={({ isActive }) => `${c.link} ${isActive ? c.active : ''}`}>
            {p.label}
          </NavLink>
        ))}
      </nav>
      <div className={c.right}>
        <AppPicker />
        {session && <span>{session.user}</span>}
        {session && <Button small onClick={onSignOut}>Sign out</Button>}
      </div>
    </header>
  );
}
