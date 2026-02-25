interface FaviconImgProps {
  url: string;
  faviconUrl: string | null;
}

function getFallbackSrc(url: string): string {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(origin)}`;
  } catch {
    return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(url)}`;
  }
}

export function FaviconImg({ url, faviconUrl }: FaviconImgProps) {
  const fallbackSrc = getFallbackSrc(url);

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
