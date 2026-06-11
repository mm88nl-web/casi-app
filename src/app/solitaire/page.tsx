import type { Metadata } from 'next';
import SolitaireGame from './_components/SolitaireGame';

export const metadata: Metadata = {
  title: 'Free Solitaire — No Ads | Casi',
  description:
    'Play classic Klondike Solitaire free online. No ads, no sign-up, no distractions. ' +
    'Drag and drop, undo, hints, draw-3 mode, and statistics — just cards.',
  keywords: ['free solitaire', 'solitaire no ads', 'klondike solitaire', 'play solitaire online'],
  openGraph: {
    title: 'Free Solitaire — No Ads',
    description: 'Classic Klondike Solitaire. Free, no ads, no sign-up.',
    url: 'https://www.casi.gg/solitaire',
  },
  alternates: { canonical: 'https://www.casi.gg/solitaire' },
};

const gameLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Klondike Solitaire',
  description:
    'Classic Klondike Solitaire — free, no ads, no sign-up. Drag and drop, undo, hints, draw-3 mode, and statistics.',
  url: 'https://www.casi.gg/solitaire',
  applicationCategory: 'Game',
  gamePlatform: 'Web browser',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'Casi', url: 'https://www.casi.gg' },
};

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Can every solitaire game be won?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          'No — roughly 80% of Klondike deals are theoretically winnable, but in practice ' +
          'good players win far fewer because key cards stay hidden until late in the game.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is draw-3 mode in solitaire?',
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          'In draw-3 mode, three cards are drawn from the stock at once and only the top one ' +
          'is playable, which makes the game noticeably harder than draw-1.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is this solitaire really free with no ads?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. No ads, no tracking pop-ups, no premium deck, no sign-up required.',
      },
    },
  ],
};

export default function SolitairePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(gameLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <SolitaireGame />
    </>
  );
}
