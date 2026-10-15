export interface RequestGuard {
  begin(): number;
  invalidate(): void;
  isCurrent(requestId: number): boolean;
}

export function createRequestGuard(): RequestGuard {
  let currentRequestId = 0;

  return {
    begin() {
      currentRequestId += 1;
      return currentRequestId;
    },
    invalidate() {
      currentRequestId += 1;
    },
    isCurrent(requestId) {
      return requestId === currentRequestId;
    },
  };
}
