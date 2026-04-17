/** Serializa lecturas/escrituras de `data/presenter-shares.json`. */
let chain: Promise<unknown> = Promise.resolve();

export function runPresenterShareExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(() => fn());
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
