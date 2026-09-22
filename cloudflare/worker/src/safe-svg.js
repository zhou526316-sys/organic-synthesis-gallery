// Original SVG bytes are retained. Reject active/external content before storing or indexing.
export function safeSvgInfo(bytes) {
  try {
    const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if (!/<svg(?:\s|>)/i.test(text) || !/<\/svg\s*>/i.test(text)) return null;
    if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)|<(?:script|foreignObject|iframe|object|embed|animate\w*|set|audio|video)\b|\son\w+\s*=|javascript\s*:|@import|\\/i.test(text)) return null;
    // Do not let entity-encoded URLs evade external-reference checks.
    if (/&#|&(?!(?:amp|lt|gt|quot|apos);)/i.test(text)) return null;
    for (const m of text.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)) {
      if (!m[2].startsWith('#') && !/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(m[2])) return null;
    }
    for (const m of text.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi)) if (!m[1].startsWith('#')) return null;
    const root = text.match(/<svg\b([^>]*)>/i)?.[1] || '';
    const box = root.match(/\bviewBox\s*=\s*["']\s*([\d.e+\-]+)[ ,]+([\d.e+\-]+)[ ,]+([\d.e+\-]+)[ ,]+([\d.e+\-]+)/i);
    const width = Number(root.match(/\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i)?.[1] || box?.[3]);
    const height = Number(root.match(/\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i)?.[1] || box?.[4]);
    if (!(width>0 && height>0 && width<=30000 && height<=30000)) return null;
    const vector = /<(?:path|line|polyline|polygon|circle|ellipse|text)\b/i.test(text);
    return {width:Math.round(width),height:Math.round(height),vector,mixed:/<image\b/i.test(text)};
  } catch {return null;}
}
