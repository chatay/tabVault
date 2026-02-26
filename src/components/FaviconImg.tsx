interface FaviconImgProps {
  url: string;
  faviconUrl: string | null;
  size?: number;
}

function getFallbackSrc(url: string): string {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(origin)}`;
  } catch {
    return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(url)}`;
  }
}

export function FaviconImg({ url, faviconUrl, size = 16 }: FaviconImgProps) {
  const fallbackSrc = getFallbackSrc(url);

  return (
    <img
      src={faviconUrl || fallbackSrc}
      alt=""
      width={size}
      height={size}
      className="shrink-0"
      onError={(e) => {
        (e.target as HTMLImageElement).src = fallbackSrc;
      }}
    />
  );
}
