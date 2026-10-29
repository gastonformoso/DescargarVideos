const SUPPORTED_HOSTS = ["youtube.com", "youtu.be", "tiktok.com", "twitter.com", "x.com"];

export function validateVideoUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Pega un enlace para empezar.";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "El enlace no es válido. Debe empezar por http:// o https://.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Solo se permiten enlaces http o https.";
  }
  const host = url.hostname.toLowerCase();
  const supported = SUPPORTED_HOSTS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
  if (!supported) {
    return "Por ahora solo se admiten enlaces de YouTube, TikTok y X (Twitter).";
  }
  return null;
}
