export function useClipboard() {
  const copy = (text) => navigator.clipboard.writeText(text);
  return { copy };
}
