import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const KEY = "fleetos.userPreferences";

type Preferences = {
  language: "en" | "pl" | "ro" | "lt" | "bg" | "uk" | "pt" | "es";
  largeText: boolean;
  largeControls: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  easyRead: boolean;
  darkMode: boolean;
  readAloud: boolean;
  voiceInput: boolean;
};

const defaults: Preferences = {
  language: "en", largeText: false, largeControls: false, highContrast: false,
  reducedMotion: false, easyRead: false, darkMode: false, readAloud: false, voiceInput: false,
};

function apply(prefs: Preferences) {
  document.documentElement.lang = prefs.language;
  document.documentElement.dataset.largeText = String(prefs.largeText);
  document.documentElement.dataset.largeControls = String(prefs.largeControls);
  document.documentElement.dataset.highContrast = String(prefs.highContrast);
  document.documentElement.dataset.reducedMotion = String(prefs.reducedMotion);
  document.documentElement.dataset.easyRead = String(prefs.easyRead);
  document.documentElement.dataset.darkMode = String(prefs.darkMode);
}

export function AccessibilityPage() {
  const [prefs, setPrefs] = useState<Preferences>(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; }
    catch { return defaults; }
  });
  const [status, setStatus] = useState("Loading your saved preferences…");

  useEffect(() => {
    void api<Preferences>("/preferences").then((saved) => {
      const next = { ...defaults, ...saved };
      setPrefs(next); localStorage.setItem(KEY, JSON.stringify(next)); apply(next); setStatus("Saved to your FleetOS account");
    }).catch(() => { apply(prefs); setStatus("Using this device's saved preferences"); });
  }, []);

  async function save(next: Preferences) {
    setPrefs(next); localStorage.setItem(KEY, JSON.stringify(next)); apply(next); setStatus("Saving…");
    try { const saved = await api<Preferences>("/preferences", { method: "PUT", body: JSON.stringify(next) }); setPrefs(saved); localStorage.setItem(KEY, JSON.stringify(saved)); apply(saved); setStatus("Saved to your FleetOS account"); }
    catch { setStatus("Saved on this device; account sync could not complete"); }
  }

  const toggle = (key: keyof Omit<Preferences, "language">) => void save({ ...prefs, [key]: !prefs[key] });

  return <div className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">Your preferences</p><h1>Accessibility & language</h1><p>These choices belong to your user account, so they can follow you between FleetOS devices without changing anyone else's interface.</p><small>{status}</small></div></div>
    <section className="dashboard-section">
      <label>Interface language
        <select value={prefs.language} onChange={(event) => void save({ ...prefs, language: event.target.value as Preferences["language"] })}>
          <option value="en">English</option><option value="pl">Polski</option><option value="ro">Română</option><option value="lt">Lietuvių</option><option value="bg">Български</option><option value="uk">Українська</option><option value="pt">Português</option><option value="es">Español</option>
        </select>
      </label>
      <div className="action-grid" style={{ marginTop: 18 }}>
        <button className="action-card" onClick={() => toggle("largeText")}><strong>Large text</strong><span>{prefs.largeText ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("largeControls")}><strong>Large controls</strong><span>{prefs.largeControls ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("highContrast")}><strong>High contrast</strong><span>{prefs.highContrast ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("reducedMotion")}><strong>Reduced motion</strong><span>{prefs.reducedMotion ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("easyRead")}><strong>Easy Read</strong><span>{prefs.easyRead ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("darkMode")}><strong>Dark / night mode</strong><span>{prefs.darkMode ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("readAloud")}><strong>Read aloud preference</strong><span>{prefs.readAloud ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("voiceInput")}><strong>Voice input preference</strong><span>{prefs.voiceInput ? "On" : "Off"}</span></button>
      </div>
    </section>
    <section className="dashboard-section"><p className="eyebrow">Translation model</p><h2>Original records stay original</h2><p>The selected language controls the user interface preference. Customer-entered evidence and messages retain the original wording; translated viewing copies can be layered on later without replacing the audit record.</p></section>
  </div>;
}
