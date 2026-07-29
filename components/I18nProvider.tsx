"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type UiLocale = "zh-CN" | "en";

const STORAGE_KEY = "mju-ui-locale";

interface I18nValue {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  toggleLocale: () => void;
  text: (zh: string, en: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>("zh-CN");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh-CN" || saved === "en") setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const setLocale = useCallback((next: UiLocale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    toggleLocale: () => setLocale(locale === "zh-CN" ? "en" : "zh-CN"),
    text: (zh, en) => locale === "zh-CN" ? zh : en,
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="language-toggle" role="group" aria-label="Language">
      <button type="button" aria-pressed={locale === "zh-CN"} onClick={() => setLocale("zh-CN")}>中</button>
      <span aria-hidden="true">/</span>
      <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
    </div>
  );
}
