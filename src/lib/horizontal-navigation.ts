export function navigationOverflowState(scrollLeft: number, clientWidth: number, scrollWidth: number) {
  const tolerance = 3;
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
  const position = Math.min(maxScrollLeft, Math.max(0, scrollLeft));
  return {
    overflow: maxScrollLeft > tolerance,
    left: maxScrollLeft > tolerance && position > tolerance,
    right: maxScrollLeft > tolerance && position < maxScrollLeft - tolerance,
  };
}
