type CancellableFunction<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): ReturnType<T>;
  cancel: () => void;
};

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): CancellableFunction<T> {
  let timeout: NodeJS.Timeout | null = null;

  const debouncedFunc = function (this: any, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  } as CancellableFunction<T>;

  debouncedFunc.cancel = () => {
    if (timeout) clearTimeout(timeout);
  };

  return debouncedFunc;
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): CancellableFunction<T> {
  let inThrottle = false;
  let lastFunc: NodeJS.Timeout | null = null;

  const throttledFunc = function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    } else {
      if (lastFunc) clearTimeout(lastFunc);
      lastFunc = setTimeout(() => func.apply(this, args), limit);
    }
  } as CancellableFunction<T>;

  throttledFunc.cancel = () => {
    if (lastFunc) clearTimeout(lastFunc);
    inThrottle = false;
  };

  return throttledFunc;
}