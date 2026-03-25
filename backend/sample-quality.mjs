const BOILERPLATE_PATTERNS = [
  /cookie/i,
  /privacy policy/i,
  /terms of service/i,
  /sign in/i,
  /sign up/i,
  /download the app/i,
  /open app/i,
  /javascript/i,
  /enable javascript/i,
  /all rights reserved/i,
  /accept all/i,
  /some privacy related extensions may cause issues on x\.com/i,
  /please disable them and try again/i,
  /this browser is no longer supported/i,
  /something went wrong/i,
  /log in to x/i,
  /sign up for x/i,
];

export function normalizeSampleText(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBoilerplateSampleText(value) {
  const text = normalizeSampleText(value);
  if (!text) {
    return true;
  }

  return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isUsableSampleText(value) {
  const text = normalizeSampleText(value);
  if (!text || text.length < 24 || text.length > 900) {
    return false;
  }

  if (/https?:\/\//i.test(text) && text.length < 80) {
    return false;
  }

  if (/<[a-z][\s\S]*>/i.test(text)) {
    return false;
  }

  if (text.split(/\s+/).length < 5) {
    return false;
  }

  return !isBoilerplateSampleText(text);
}
