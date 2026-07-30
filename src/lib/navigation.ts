import { router, type Href } from 'expo-router';

/**
 * Bezpieczny powrót: jeśli jest dokąd wrócić (jest historia), cofa się.
 * W przeciwnym razie (np. po odświeżeniu strony bezpośrednio na danym ekranie)
 * przechodzi na podany ekran zastępczy — dzięki temu nie ma ostrzeżenia
 * "GO_BACK was not handled".
 */
export function goBack(fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
