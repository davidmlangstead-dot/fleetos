import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import {
  ACCESSIBILITY_KEY,
  accessibilityDefaults,
  applyAccessibilityPreferences,
  loadLocalAccessibilityPreferences,
  readPageAloud,
  saveLocalAccessibilityPreferences,
  stopReadingAloud,
  type AccessibilityPreferences,
} from "../../lib/accessibility";
import { useI18n } from "../../lib/i18n";

type Preferences = AccessibilityPreferences;

export function AccessibilityPage() {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<Preferences>(() => loadLocalAccessibilityPreferences());
  const [status, setStatus] = useState("Loading your saved preferences…");
  const [voiceResult, setVoiceResult] = useState("");

  useEffect(() => {
    void api<Preferences>("/preferences").then((saved) => {
      const next = { ...accessibilityDefaults, ...saved };
      setPrefs(next); saveLocalAccessibilityPreferences(next); applyAccessibilityPreferences(next); setStatus("Saved to your FleetOS account");
    }).catch(() => { applyAccessibilityPreferences(prefs); setStatus("Using this device's saved preferences"); });
  }, []);

  async function save(next: Preferences) {
    setPrefs(next); saveLocalAccessibilityPreferences(next); applyAccessibilityPreferences(next); setStatus("Saving…");
    try {
      const saved = await api<Preferences>("/preferences", { method: "PUT", body: JSON.stringify(next) });
      setPrefs(saved); saveLocalAccessibilityPreferences(saved); applyAccessibilityPreferences(saved); setStatus("Saved to your FleetOS account");
    } catch {
      setStatus("Saved on this device; account sync could not complete");
    }
  }

  const toggle = (key: keyof Omit<Preferences, "language">) => void save({ ...prefs, [key]: !prefs[key] });

  function startReading() {
    setVoiceResult(readPageAloud() ? "Reading this page aloud." : "Read aloud is not supported by this browser.");
  }

  function testVoiceInput() {
    const browserWindow = window as typeof window & {
      SpeechRecognition?: new () => {
        lang: string; interimResults: boolean; continuous: boolean;
        start: () => void;
        onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
        onerror: (() => void) | null;
      };
      webkitSpeechRecognition?: new () => {
        lang: string; interimResults: boolean; continuous: boolean;
        start: () => void;
        onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
        onerror: (() => void) | null;
      };
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) { setVoiceResult("Voice input is not supported by this browser."); return; }
    const recognition = new Recognition();
    recognition.lang = prefs.language === "en" ? "en-GB" : prefs.language;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => setVoiceResult(`Heard: ${event.results[0]?.[0]?.transcript ?? ""}`);
    recognition.onerror = () => setVoiceResult("Voice input could not start. Check microphone permission and browser support.");
    setVoiceResult("Listening…");
    recognition.start();
  }

  return <div className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">{t("prefs.eyebrow")}</p><h1>{t("prefs.title")}</h1><p>{t("prefs.intro")}</p><small>{status}</small></div></div>
    <section className="dashboard-section">
      <label>{t("prefs.language")}
        <select value={prefs.language} onChange={(event) => void save({ ...prefs, language: event.target.value as Preferences["language"] })}>
          <option value="en">English</option><option value="pl">Polski</option><option value="ro">Română</option><option value="lt">Lietuvių</option><option value="bg">Български</option><option value="uk">Українська</option><option value="pt">Português</option><option value="es">Español</option>
        </select>
      </label>
      <p className="subtle">{t("prefs.translationReady")}</p>
      <div className="action-grid" style={{ marginTop: 18 }}>
        <button className="action-card" onClick={() => toggle("largeText")}><strong>{t("prefs.largeText")}</strong><span>{t(prefs.largeText ? "common.on" : "common.off")}</span></button>
        <button className="action-card" onClick={() => toggle("largeControls")}><strong>{t("prefs.largeControls")}</strong><span>{t(prefs.largeControls ? "common.on" : "common.off")}</span></button>
        <button className="action-card" onClick={() => toggle("highContrast")}><strong>High contrast</strong><span>{prefs.highContrast ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("reducedMotion")}><strong>Reduced motion</strong><span>{prefs.reducedMotion ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("easyRead")}><strong>Easy Read</strong><span>{prefs.easyRead ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("darkMode")}><strong>Dark / night mode</strong><span>{prefs.darkMode ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("readAloud")}><strong>Read aloud preference</strong><span>{prefs.readAloud ? "On" : "Off"}</span></button>
        <button className="action-card" onClick={() => toggle("voiceInput")}><strong>Voice input preference</strong><span>{prefs.voiceInput ? "On" : "Off"}</span></button>
      </div>
    </section>
    <section className="dashboard-section"><p className="eyebrow">Try it now</p><h2>Speech tools</h2><div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}><button onClick={startReading}>Read this page aloud</button><button onClick={stopReadingAloud}>Stop reading</button><button onClick={testVoiceInput}>Test voice input</button></div>{voiceResult&&<p className="subtle">{voiceResult}</p>}</section>
    <section className="dashboard-section"><p className="eyebrow">Translation model</p><h2>Original records stay original</h2><p>The selected language controls your interface preference and speech locale. Customer-entered evidence and messages retain their original wording; translated viewing copies can be layered on later without replacing the audit record.</p></section>
  </div>;
}

