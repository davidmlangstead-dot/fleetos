import { useEffect, useState } from "react";

const KEY = "fleetos.userPreferences";

type Preferences = {
  language: string;
  largeText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  easyRead: boolean;
};

const defaults: Preferences = { language: "en", largeText: false, highContrast: false, reducedMotion: false, easyRead: false };

function apply(prefs: Preferences) {
  document.documentElement.lang = prefs.language;
  document.documentElement.dataset.largeText = String(prefs.largeText);
  document.documentElement.dataset.highContrast = String(prefs.highContrast);
  document.documentElement.dataset.reducedMotion = String(prefs.reducedMotion);
  document.documentElement.dataset.easyRead = String(prefs.easyRead);
}

export function AccessibilityPage() {
  const [prefs, setPrefs] = useState<Preferences>(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; }
    catch { return defaults; }
  });

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(prefs)); apply(prefs); }, [prefs]);

  const toggle = (key: keyof Omit<Preferences, "language">) => setPrefs((current) => ({ ...current, [key]: !current[key] }));

  return <div className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">Your preferences</p><h1>Accessibility & language</h1><p>These choices apply to this user on this device without changing the rest of the company.</p></div></div>
    <section className="dashboard-section">
      <label>Interface language
        <select value={prefs.language} onChange={(event) => setPrefs((current) => ({ ...current, language: event.target.value }))}>
          <option value="en">English</option><option value="pl">Polski</option><option value="ro">Română</option><option value="lt">Lietuvių</option><option value="bg">Български</option><option value="uk">Українська</option><option value="pt">Português</option><option value="es">Español</option>
        </select>
      </label>
      <div className="action-grid" style={{ marginTop: 18 }}>
        <button className="action-card" onClick={() => toggle("largeText")}><strong>Large text & controls</strong><span>{prefs.largeText ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("highContrast")}><strong>High contrast</strong><span>{prefs.highContrast ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("reducedMotion")}><strong>Reduced motion</strong><span>{prefs.reducedMotion ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("easyRead")}><strong>Easy Read</strong><span>{prefs.easyRead ? "On" : "Off"}</span></button>
      </div>
    </section>
    <section className="dashboard-section"><p className="eyebrow">Translation model</p><h2>Original records stay original</h2><p>The selected language is the user interface preference. Customer-entered evidence and messages should retain the original wording; translated viewing copies can be added without replacing the audit record.</p></section>
  </div>;
}
