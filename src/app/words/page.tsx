import type { Metadata } from 'next';
import WordGen from './_components/WordGen';

export const metadata: Metadata = {
  title: 'Random Word Generator — Free | Casi',
  description:
    'Free random word generator for rap, writing, and brainstorming. ' +
    'Pick nouns, adjectives, verbs — or any word. 55,000+ words. No ads.',
  keywords: ['random word generator', 'word generator', 'rap word generator', 'free word generator'],
  openGraph: {
    title: 'Random Word Generator — Free, No Ads',
    description: 'Generate random words for rap, writing, or brainstorming. 55,000+ words.',
    url: 'https://www.casi.gg/words',
  },
  alternates: { canonical: 'https://www.casi.gg/words' },
};

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Can I use these words commercially?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          'Yes. The generator picks ordinary English dictionary words, which nobody owns. ' +
          'Anything you write with them — lyrics, copy, stories — is entirely yours.',
      },
    },
    {
      '@type': 'Question',
      name: 'How many words are in the list?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          'Around 55,000 English words across nouns, adjectives, and verbs. ' +
          'The exact count is shown on the page once the word list loads.',
      },
    },
    {
      '@type': 'Question',
      name: 'What categories are available?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          'Nouns, adjectives, and verbs — or "any", which draws from all three at once. ' +
          'You can also generate 1, 2, or 3 words per tap.',
      },
    },
  ],
};

export default function WordsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <WordGen />
    </>
  );
}
