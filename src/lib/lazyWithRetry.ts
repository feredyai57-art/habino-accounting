import React, { lazy } from 'react';

/**
 * Robust wrapper around React.lazy that retries failed dynamic imports
 * (e.g. on dev server restarts, network blips, or deployment chunk updates).
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T } | any>,
  retries = 3,
  delayMs = 600
): React.LazyExoticComponent<T> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (attemptNumber: number) => {
        factory()
          .then(module => {
            if (module && typeof module === 'object') {
              if (module.default) {
                resolve(module as { default: T });
              } else {
                const keys = Object.keys(module);
                const component = module[keys[0]] || module;
                resolve({ default: component as T });
              }
            } else {
              resolve(module);
            }
          })
          .catch(error => {
            if (attemptNumber < retries) {
              console.warn(
                `[LazyRetry] Dynamic chunk import failed (attempt ${attemptNumber}/${retries}), retrying in ${delayMs}ms...`,
                error
              );
              setTimeout(() => attempt(attemptNumber + 1), delayMs);
            } else {
              // If it's a dynamic module fetch failure after all retries, reload the page once to pull the fresh bundle
              if (
                typeof window !== 'undefined' &&
                error?.message?.includes('Failed to fetch dynamically imported module')
              ) {
                const retryKey = 'habino_chunk_reload_lock';
                const lastRetry = sessionStorage.getItem(retryKey);
                if (!lastRetry || Date.now() - Number(lastRetry) > 15000) {
                  sessionStorage.setItem(retryKey, String(Date.now()));
                  window.location.reload();
                  return;
                }
              }
              reject(error);
            }
          });
      };

      attempt(1);
    })
  );
}
