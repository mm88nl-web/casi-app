// Renders viewer-uploaded media that may be an image or a video. A raw
// <img> with an mp4/webm src renders as a broken/blank square; this
// component branches on file_type (falling back to a URL regex) so
// every surface — admin canvas, request cards, overlay thumbnails,
// slot previews — displays the media correctly.
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
