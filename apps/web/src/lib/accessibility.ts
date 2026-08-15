export const ACCESSIBILITY_KEY = "fleetos.userPreferences";

export type AccessibilityPreferences = {
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

export const accessibilityDefaults: AccessibilityPreferences = {
  language: "en",
  largeText: false,
  largeControls: false,
  highContrast: false,
  reducedMotion: false,
  easyRead: false,
  darkMode: false,
  readAloud: false,
  voiceInput: false,
};

export function loadLocalAccessibilityPreferences(): AccessibilityPreferences {
  try {
    return { ...accessibilityDefaults, ...JSON.parse(localStorage.getItem(ACCESSIBILITY_KEY) ?? "{}") };
  } catch {
    return accessibilityDefaults;
  }
}

export function saveLocalAccessibilityPreferences(prefs: AccessibilityPreferences) {
  localStorage.setItem(ACCESSIBILITY_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent("fleetos:preferences", { detail: prefs }));
}

export function applyAccessibilityPreferences(prefs: AccessibilityPreferences) {
  const root = document.documentElement;
  root.lang = prefs.language;
  root.dataset.largeText = String(prefs.largeText);
  root.dataset.largeControls = String(prefs.largeControls);
  root.dataset.highContrast = String(prefs.highContrast);
  root.dataset.reducedMotion = String(prefs.reducedMotion);
  root.dataset.easyRead = String(prefs.easyRead);
  root.dataset.darkMode = String(prefs.darkMode);
}

export function bootstrapAccessibilityPreferences() {
  applyAccessibilityPreferences(loadLocalAccessibilityPreferences());
}

export function readPageAloud() {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const text = document.querySelector("main")?.textContent?.replace(/\s+/g, " ").trim();
  if (!text) return false;
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 12000));
  utterance.lang = document.documentElement.lang || "en-GB";
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopReadingAloud() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

