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
  const [status, setStatus] = useState(t("prefs.loading"));
  const [voiceResult, setVoiceResult] = useState("");

  useEffect(() => {
    void api<Preferences>("/preferences").then((saved) => {
      const next = { ...accessibilityDefaults, ...saved };
      setPrefs(next); saveLocalAccessibilityPreferences(next); applyAccessibilityPreferences(next); setStatus(t("prefs.savedAccount"));
    }).catch(() => { applyAccessibilityPreferences(prefs); setStatus(t("prefs.savedDevice")); });
  }, []);

  async function save(next: Preferences) {
    setPrefs(next); saveLocalAccessibilityPreferences(next); applyAccessibilityPreferences(next); setStatus(t("prefs.saving"));
    try {
      const saved = await api<Preferences>("/preferences", { method: "PUT", body: JSON.stringify(next) });
      setPrefs(saved); saveLocalAccessibilityPreferences(saved); applyAccessibilityPreferences(saved); setStatus(t("prefs.savedAccount"));
    } catch {
      setStatus(t("prefs.syncFailed"));
    }
  }

  const toggle = (key: keyof Omit<Preferences, "language">) => void save({ ...prefs, [key]: !prefs[key] });

  function startReading() {
    setVoiceResult(t(readPageAloud() ? "prefs.reading" : "prefs.readUnsupported"));
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
    if (!Recognition) { setVoiceResult(t("prefs.voiceUnsupported")); return; }
    const recognition = new Recognition();
    recognition.lang = prefs.language === "en" ? "en-GB" : prefs.language;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => setVoiceResult(`${t("prefs.heard")}: ${event.results[0]?.[0]?.transcript ?? ""}`);
    recognition.onerror = () => setVoiceResult(t("prefs.voiceFailed"));
    setVoiceResult(t("prefs.listening"));
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
        <button className="action-card" onClick={() => toggle("highContrast")}><strong>{t("prefs.highContrast")}</strong><span>{t(prefs.highContrast ? "common.on" : "common.off")}</span></button>
        <button className="action-card" onClick={() => toggle("reducedMotion")}><strong>{t("prefs.reducedMotion")}</strong><span>{t(prefs.reducedMotion ? "common.on" : "common.off")}</span></button>
        <button className="action-card" onClick={() => toggle("easyRead")}><strong>{t("prefs.easyRead")}</strong><span>{t(prefs.easyRead ? "common.on" : "common.off")}</span></button>
        <button className="action-card" onClick={() => toggle("darkMode")}><strong>{t("prefs.darkMode")}</strong><span>{t(prefs.darkMode ? "common.on" : "common.off")}</span></button>
        <button className="action-card" onClick={() => toggle("readAloud")}><strong>{t("prefs.readAloud")}</strong><span>{t(prefs.readAloud ? "common.on" : "common.off")}</span></button>
        <button className="action-card" onClick={() => toggle("voiceInput")}><strong>{t("prefs.voiceInput")}</strong><span>{t(prefs.voiceInput ? "common.on" : "common.off")}</span></button>
      </div>
    </section>
    <section className="dashboard-section"><p className="eyebrow">{t("prefs.tryNow")}</p><h2>{t("prefs.speechTools")}</h2><div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}><button onClick={startReading}>{t("prefs.readPage")}</button><button onClick={stopReadingAloud}>{t("prefs.stopReading")}</button><button onClick={testVoiceInput}>{t("prefs.testVoice")}</button></div>{voiceResult&&<p className="subtle">{voiceResult}</p>}</section>
    <section className="dashboard-section"><p className="eyebrow">{t("prefs.translationModel")}</p><h2>{t("prefs.originalTitle")}</h2><p>{t("prefs.originalDetail")}</p></section>
  </div>;
}


