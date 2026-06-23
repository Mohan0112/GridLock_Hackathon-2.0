export type Page = "intro" | "overview" | "map";

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function TopNav({
  page,
  onChange,
  theme,
  onToggleTheme,
  onAbout,
}: {
  page: Page;
  onChange: (p: Page) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onAbout: () => void;
}) {
  const tabs: { id: Page; label: string }[] = [
    { id: "intro", label: "Introduction" },
    { id: "overview", label: "Overview" },
    { id: "map", label: "Map" },
  ];

  return (
    <header className="flex shrink-0 items-center gap-6 border-b border-line bg-panel px-5 py-3">
      <div className="flex items-center gap-2">
        <svg width="22" height="20" viewBox="0 0 22 20" aria-hidden="true">
          <polygon
            points="6,1 16,1 21,10 16,19 6,19 1,10"
            fill="none"
            stroke="#F2762E"
            strokeWidth="2"
          />
          <circle cx="11" cy="10" r="3" fill="#F2762E" />
        </svg>
        <span className="font-semibold text-paper">GRIDLOCK</span>
      </div>

      <nav className="flex items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              page === tab.id
                ? "bg-orange/15 font-medium text-orange"
                : "text-mist hover:text-paper"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onAbout}
          className="rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-mist transition hover:border-mist hover:text-paper"
        >
          About
        </button>
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="flex h-8 w-8 items-center justify-center rounded-md text-mist transition hover:bg-panel2 hover:text-paper"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  );
}
