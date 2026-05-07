type Props = { text: string };

export function Marquee({ text }: Props) {
  return (
    <div className="casi-v9-marquee" aria-hidden="true">
      <div className="casi-v9-marquee-track">
        <span>{text}</span>
      </div>
      <div className="casi-v9-marquee-track">
        <span>{text}</span>
      </div>
    </div>
  );
}
