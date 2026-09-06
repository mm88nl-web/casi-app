type Props = { text: string };

export function Marquee({ text }: Props) {
  return (
    // data-paper="light" — see the comment in NavBar.tsx; the marquee is
    // Casi's own chrome and must stay pinned to the light chrome palette.
    <div className="casi-v9-marquee" data-paper="light" aria-hidden="true">
      <div className="casi-v9-marquee-track">
        <span>{text}</span>
      </div>
      <div className="casi-v9-marquee-track">
        <span>{text}</span>
      </div>
    </div>
  );
}
