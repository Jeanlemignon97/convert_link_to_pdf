export function shouldSendZip(resultCount: number, failureCount: number, forceZip: boolean): boolean {
  if (forceZip) {
    return true;
  }

  return resultCount > 1 || failureCount > 0;
}
