// Admin canvas + request cards show whatever the viewer uploaded. Overlay
// already branches on file_type; admin used <img> everywhere, so mp4/webm
// uploads showed as broken images on the streamer's side.
export default function SlotMedia({
  src,
  fileType,
  style,
  alt = '',
}: {
  src: string | null | undefined;
  fileType?: string | null;
  style?: React.CSSProperties;
  alt?: string;
}) {
  if (!src) return null;
  const isVideo = fileType === 'video' || /\.(mp4|webm|mov|ogv)(\?|$)/i.test(src);
  return isVideo ? (
    <video src={src} autoPlay loop muted playsInline style={style} />
  ) : (
    <img src={src} style={style} alt={alt} />
  );
}
