import type { Href } from 'expo-router';

export type LegalDocumentSlug = 'terms' | 'privacy';

// Dokumenty prawne pokazujemy jako pełnoekranowy modal (overlay), a NIE jako trasę
// nawigacji. Dzięki temu nie mogą zostać „odtworzone" jako ekran startowy aplikacji
// (co wcześniej powodowało otwieranie regulaminu po wejściu z niedziałającym „wstecz").
type Listener = (slug: LegalDocumentSlug) => void;

let activeListener: Listener | null = null;

/** Rejestruje host modala (wywoływane przez <LegalDocumentHost />). */
export function registerLegalDocumentHost(listener: Listener | null): void {
  activeListener = listener;
}

/**
 * Otwiera dokument prawny (regulamin / polityka) jako modal.
 * Parametr `returnTo` zostaje dla zgodności z wcześniejszymi wywołaniami, ale nie jest
 * już potrzebny — zamknięcie modala po prostu wraca do bieżącego ekranu.
 */
export function openLegalDocument(doc: LegalDocumentSlug, _returnTo?: Href): void {
  if (activeListener) {
    activeListener(doc);
  }
}
