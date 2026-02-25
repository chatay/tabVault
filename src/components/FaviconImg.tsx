interface FaviconImgProps {
  url: string;
  faviconUrl: string | null;
}

export function FaviconImg({ url, faviconUrl }: FaviconImgProps) {
  const fallbackSrc = `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(new URL(url).origin)}`;

  return (
    <img
      src={faviconUrl || fallbackSrc}
      alt=""
      width={16}
      height={16}
      className="shrink-0"
      onError={(e) => {
        (e.target as HTMLImageElement).src = fallbackSrc;
      }}
    />
  );
}
