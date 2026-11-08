import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Avatar } from './Avatar';
import { BOTS, STATE_ORDER, STATES } from './data';
import type { BotState } from './data';

const TOUR_MS = 4200;

function PauseIcon({ paused }: { paused: boolean }) {
  return paused ? (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <path d="M2 1.2v8.6L9.6 5.5 2 1.2Z" fill="currentColor" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <rect x="1.5" y="1" width="2.6" height="9" rx="1" fill="currentColor" />
      <rect x="6.9" y="1" width="2.6" height="9" rx="1" fill="currentColor" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: 'dark' | 'light' }) {
  return theme === 'dark' ? (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.05 3.05l1.13 1.13M11.82 11.82l1.13 1.13M12.95 3.05l-1.13 1.13M4.18 11.82l-1.13 1.13" />
      </g>
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6.2 6.2 0 1 0 7.7 7.7Z" fill="currentColor" />
    </svg>
  );
}

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [bots, setBots] = useState(BOTS);
  const [activeId, setActiveId] = useState(BOTS[0].id);
  const [paused, setPaused] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [progress, setProgress] = useState(0);

  const active = bots.find((bot) => bot.id === activeId) ?? bots[0];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setState = useCallback(
    (state: BotState) => {
      setBots((list) => list.map((bot) => (bot.id === activeId ? { ...bot, state } : bot)));
    },
    [activeId],
  );

  useEffect(() => {
    setProgress(0);
    if (paused) return;
    let elapsed = 0;
    const timer = window.setInterval(() => {
      elapsed += 50;
      setProgress(Math.min(1, elapsed / TOUR_MS));
      if (elapsed >= TOUR_MS) {
        elapsed = 0;
        setBots((list) =>
          list.map((bot) =>
            bot.id === activeId
              ? { ...bot, state: STATE_ORDER[(STATE_ORDER.indexOf(bot.state) + 1) % STATE_ORDER.length] }
              : bot,
          ),
        );
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [activeId, paused, active.state]);

  const pickState = (state: BotState) => {
    setPaused(true);
    setState(state);
  };

  const pickBot = (id: string) => {
    setActiveId(id);
    setProgress(0);
  };

  return (
    <div className="page">
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Grok Bot avatar study">
          <span className="wordmark-glyph" aria-hidden="true">
            <span />
            <span />
          </span>
          Grok Bot
        </a>
        <nav>
          <a className="text-link" href="https://x.ai/news/designing-grok-bot" target="_blank" rel="noreferrer">
            Designing Grok Bot <span aria-hidden="true">↗</span>
          </a>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <ThemeIcon theme={theme} />
          </button>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <p className="eyebrow">Avatar motion system</p>
          <h1>
            Six states.
            <br />
            One character.
          </h1>
          <p className="lede">
            A Bot is idle, thinking, working, waiting, blocked, or done. Instead of adding another status indicator, the
            avatar carries the lifecycle itself. At rest it is calm and curious. When work arrives it acknowledges, kicks
            into gear, waits, asks for help, then settles.
          </p>
        </section>

        <section className="console" aria-label="Lifecycle player">
          <div className="stage-card" style={{ '--bot': active.color } as CSSProperties}>
            <div className="stage-top">
              <div className="who">
                <span className="who-dot" aria-hidden="true" />
                <span className="who-name">{active.name}</span>
                <span className="who-role">{active.role}</span>
              </div>
              <button
                type="button"
                className="pause-button"
                onClick={() => setPaused(!paused)}
                aria-label={paused ? 'Resume the lifecycle tour' : 'Pause the lifecycle tour'}
              >
                <PauseIcon paused={paused} />
              </button>
            </div>

            <div className="stage-avatar">
              <Avatar bot={active} state={active.state} />
            </div>

            <div className="stage-caption" aria-live="polite">
              <p className="stage-state">{STATES[active.state].label}</p>
              <p className="stage-headline">{STATES[active.state].headline}</p>
              <p className="stage-description">{STATES[active.state].description}</p>
            </div>

            <div className="tabs" role="tablist" aria-label="Agent lifecycle stages">
              {STATE_ORDER.map((state) => {
                const selected = active.state === state;
                return (
                  <button
                    key={state}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`tab${selected ? ' is-selected' : ''}`}
                    onClick={() => pickState(state)}
                  >
                    <span className="tab-label">{STATES[state].label}</span>
                    <span className="tab-track">
                      <span
                        className="tab-fill"
                        style={{ transform: `scaleX(${selected ? progress : 0})` }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="roster" aria-label="Your Bots">
            <div className="roster-head">
              <h2>Your Bots</h2>
              <p>The same motion language, carried by every identity and silhouette.</p>
            </div>
            <ul className="roster-list">
              {bots.map((bot) => {
                const selected = bot.id === active.id;
                return (
                  <li key={bot.id}>
                    <button
                      type="button"
                      className={`roster-row${selected ? ' is-selected' : ''}`}
                      style={{ '--bot': bot.color } as CSSProperties}
                      onClick={() => pickBot(bot.id)}
                      aria-pressed={selected}
                    >
                      <Avatar bot={bot} state={bot.state} className="roster-avatar" showTrails={false} />
                      <span className="roster-meta">
                        <span className="roster-name">{bot.name}</span>
                        <span className="roster-role">{bot.role}</span>
                      </span>
                      <span className={`roster-state state-${bot.state}`}>
                        <span className="state-dot" aria-hidden="true" />
                        {STATES[bot.state].label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="roster-note">Select a Bot to follow its state. Selecting a stage pauses the tour.</p>
          </aside>
        </section>

        <section className="states-section" aria-labelledby="states-heading">
          <div className="section-head">
            <p className="eyebrow">Lifecycle</p>
            <h2 id="states-heading">The avatar carries the status</h2>
            <p className="section-lede">
              Six states, no badges. Blocked and thinking replace the silhouette with punctuation; done loops
              paint ribbons around the character before settling.
            </p>
          </div>
          <div className="state-grid">
            {STATE_ORDER.map((state) => {
              const selected = active.state === state;
              return (
                <button
                  key={state}
                  type="button"
                  className={`state-card${selected ? ' is-selected' : ''}`}
                  style={{ '--bot': active.color } as CSSProperties}
                  onClick={() => pickState(state)}
                  aria-pressed={selected}
                >
                  <div className="state-card-avatar">
                    <Avatar bot={active} state={state} showTrails={false} />
                  </div>
                  <div className="state-card-copy">
                    <span className="state-card-label">
                      <span className="state-dot" aria-hidden="true" />
                      {STATES[state].label}
                    </span>
                    <span className="state-card-headline">{STATES[state].headline}</span>
                    <span className="state-card-description">{STATES[state].description}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="shapes-section" aria-labelledby="shapes-heading">
          <div className="section-head">
            <p className="eyebrow">Identity</p>
            <h2 id="shapes-heading">Different avatars, one language</h2>
            <p className="section-lede">
              A Bot can be a circle, a drop, a triangle, or something lumpier. Shape, color, eye spacing, and eye tilt
              make the character; the motion system makes it legible.
            </p>
          </div>
          <div className="shape-rail">
            {bots.map((bot) => (
              <button
                key={bot.id}
                type="button"
                className={`shape-chip${bot.id === active.id ? ' is-selected' : ''}`}
                style={{ '--bot': bot.color } as CSSProperties}
                onClick={() => pickBot(bot.id)}
              >
                <Avatar bot={bot} state={bot.state} showTrails={false} />
                <span>{bot.name}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <span>Reconstruction of the design described in “Designing Grok Bot.”</span>
        <span>
          Geometry and palette sampled from the article. Motion is fitted, not the production implementation.
        </span>
        <a className="text-link" href="https://x.ai/news/designing-grok-bot" target="_blank" rel="noreferrer">
          x.ai/news/designing-grok-bot ↗
        </a>
      </footer>
    </div>
  );
}
