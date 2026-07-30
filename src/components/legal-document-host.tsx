import { useEffect, useState } from 'react';
import { Modal } from 'react-native';

import { LegalDocumentView } from '@/components/legal-document';
import { privacyPl } from '@/content/legal/privacy-pl';
import { termsPl } from '@/content/legal/terms-pl';
import { registerLegalDocumentHost, type LegalDocumentSlug } from '@/lib/legal-navigation';

const DOCUMENTS = {
  terms: termsPl,
  privacy: privacyPl,
};

/**
 * Host dokumentów prawnych. Pokazuje regulamin / politykę jako pełnoekranowy modal,
 * zamiast jako osobną trasę nawigacji. Dzięki temu ekran prawny nie może zostać
 * „odtworzony" jako ekran startowy aplikacji, a przycisk „wstecz" zawsze działa
 * (po prostu zamyka modal). Montowany wysoko w drzewie, więc działa zarówno na
 * ekranach logowania, jak i w zalogowanej aplikacji.
 */
export function LegalDocumentHost() {
  const [slug, setSlug] = useState<LegalDocumentSlug | null>(null);

  useEffect(() => {
    registerLegalDocumentHost((next) => setSlug(next));
    return () => registerLegalDocumentHost(null);
  }, []);

  const close = () => setSlug(null);

  return (
    <Modal
      visible={slug !== null}
      animationType="slide"
      onRequestClose={close}
      presentationStyle="fullScreen">
      {slug ? <LegalDocumentView document={DOCUMENTS[slug]} onClose={close} /> : null}
    </Modal>
  );
}
