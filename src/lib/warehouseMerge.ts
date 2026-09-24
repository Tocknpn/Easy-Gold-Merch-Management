// ── MKT ↔ CS matching (mirrors §6.8 of the APP MASTER SPEC) ──────────────
// A CS SKU created from a finalized `cs_transfer` keeps the MKT SKU id
// (migration 0013), but CS SKUs typed in by hand have their own id and only
// the name matches. So pair by id first, then by trimmed lowercased name.
export interface WarehousePair<T> {
  /** Stable identity — safe for React keys and row de-duplication. */
  key: string;
  mkt?: T;
  cs?: T;
  match: 'mkt_only' | 'cs_only' | 'both';
}

const norm = (s?: string | null): string => (s || '').trim().toLowerCase();

export function matchAcrossWarehouses<T extends { id: string; name?: string | null }>(
  mktItems: T[],
  csItems: T[],
): WarehousePair<T>[] {
  const pairs: WarehousePair<T>[] = [];
  const byId = new Map<string, WarehousePair<T>>();
  const byName = new Map<string, WarehousePair<T>>();

  for (const item of mktItems) {
    const pair: WarehousePair<T> = { key: `mkt:${item.id}`, mkt: item, match: 'mkt_only' };
    byId.set(String(item.id), pair);
    const name = norm(item.name);
    if (name && !byName.has(name)) byName.set(name, pair);
    pairs.push(pair);
  }

  for (const item of csItems) {
    const id = String(item.id);
    const name = norm(item.name);
    const pair = byId.get(id) || (name ? byName.get(name) : undefined);
    if (pair && !pair.cs) {
      pair.cs = item;
      pair.match = 'both';
      byId.set(id, pair);
      if (name) byName.set(name, pair);
      continue;
    }
    const fresh: WarehousePair<T> = { key: `cs:${item.id}`, cs: item, match: 'cs_only' };
    if (!byId.has(id)) byId.set(id, fresh);
    if (name && !byName.has(name)) byName.set(name, fresh);
    pairs.push(fresh);
  }

  return pairs;
}
