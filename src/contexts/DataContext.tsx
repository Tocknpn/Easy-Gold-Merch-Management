import {
  createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode,
} from 'react';
import type {
  AppUser, SKU, CS_SKU, TicketWithItems, StockTransaction, CS_Transaction,
  TicketAction, SkuRemark, SystemConfig, TicketStatus, TicketType,
} from '@/lib/types';
import {
  apiFetchBundle, apiCreateTicket, apiUpdateTicketStatus,
  apiAddSku, apiUpdateSku, apiDeleteSku, apiRestockSku,
  apiCsAddSku, apiCsUpdateSku, apiCsDeleteSku, apiCsRestockSku, apiCsDestockSku,
  apiMktDestockSku, apiTransferMktToCs,
  apiTransferCsToMkt, apiManageConfig, apiManageCategory, apiAddRemark,
  apiUploadSkuImage, apiDeleteSkuImage, apiSetSkuImage,
} from '@/lib/api';
import { actionableTicketCount } from '@/lib/stockMovement';
import { isSupabaseConfigured, supabase as sb } from '@/lib/supabase';
import { useRealtimeRefresh } from '@/hooks/useRealtime';

interface DataCtx {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  // data
  users: AppUser[];
  skus: SKU[];
  csSkus: CS_SKU[];
  tickets: TicketWithItems[];
  transactions: StockTransaction[];
  csTransactions: CS_Transaction[];
  actions: TicketAction[];
  categories: string[];
  config: SystemConfig;
  remarks: SkuRemark[];
  isDemo: boolean;
  // derived
  actionableTicketCount: number;
  // actions
  createTicket: (p: {
    createdBy: string; createdByName: string; department: string;
    deliveryDate?: string | null; remark?: string; type: TicketType; returnDate?: string | null;
    items: { skuId: string; skuName: string; qtyRequested: number; unit?: string }[];
  }) => Promise<string>;
  updateTicketStatus: (ticketId: string, status: TicketStatus, meta: {
    actorName: string; actorRole: string; comment?: string;
    actualDeliveryDate?: string | null;
    items?: { skuId: string; qtyApproved: number }[] | null;
    returns?: { skuId: string; qtyReturned: number; qtyBroken: number }[] | null;
    forceFinalize?: boolean;
  }) => Promise<void>;
  addSku: typeof apiAddSku;
  updateSku: typeof apiUpdateSku;
  deleteSku: typeof apiDeleteSku;
  restockSku: typeof apiRestockSku;
  csAddSku: typeof apiCsAddSku;
  csUpdateSku: typeof apiCsUpdateSku;
  csDeleteSku: typeof apiCsDeleteSku;
  csRestockSku: typeof apiCsRestockSku;
  csDestockSku: typeof apiCsDestockSku;
  mktDestockSku: typeof apiMktDestockSku;
  transferMktToCs: typeof apiTransferMktToCs;
  transferCsToMkt: typeof apiTransferCsToMkt;
  manageConfig: typeof apiManageConfig;
  manageCategory: typeof apiManageCategory;
  addRemark: typeof apiAddRemark;
  uploadSkuImage: typeof apiUploadSkuImage;
  deleteSkuImage: typeof apiDeleteSkuImage;
  setSkuImage: typeof apiSetSkuImage;
}

const Ctx = createContext<DataCtx | null>(null);

export function DataProvider({ children, role }: { children: ReactNode; role?: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof apiFetchBundle>> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await apiFetchBundle();
      setData(b);
    } catch (e: any) {
      setError(e?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Real-time: push refetch when the DB changes (live mode).
  useRealtimeRefresh(refresh);

  const actionCount = useMemo(
    () => (data ? actionableTicketCount(data.tickets, role || 'staff') : 0),
    [data, role],
  );

  const actions = useMemo(() => {
    const run = async <T,>(fn: Promise<T>): Promise<T> => {
      const res = await fn;
      await refresh();
      return res;
    };
    return {
      createTicket: (p: Parameters<DataCtx['createTicket']>[0]) =>
        run(apiCreateTicket(p)).then((r) => r.id),
      updateTicketStatus: (id: string, status: TicketStatus, meta: Parameters<DataCtx['updateTicketStatus']>[2]) =>
        run(apiUpdateTicketStatus(id, status, meta)),
      addSku: (sku: Partial<SKU>) => run(apiAddSku(sku)),
      updateSku: (id: string, u: Partial<SKU>) => run(apiUpdateSku(id, u)),
      deleteSku: (id: string) => run(apiDeleteSku(id)),
      restockSku: (id: string, qty: number, by?: string, cmt?: string) => run(apiRestockSku(id, qty, by, cmt)),
      csAddSku: (sku: Partial<CS_SKU>) => run(apiCsAddSku(sku)),
      csUpdateSku: (id: string, u: Partial<CS_SKU>) => run(apiCsUpdateSku(id, u)),
      csDeleteSku: (id: string) => run(apiCsDeleteSku(id)),
      csRestockSku: (id: string, qty: number, by?: string, cmt?: string) => run(apiCsRestockSku(id, qty, by, cmt)),
      csDestockSku: (id: string, qty: number, by?: string, cmt?: string, broken?: number) => run(apiCsDestockSku(id, qty, by, cmt, broken)),
      mktDestockSku: (id: string, qty: number, by?: string, cmt?: string, broken?: number) => run(apiMktDestockSku(id, qty, by, cmt, broken)),
      transferMktToCs: (id: string, qty: number, by: string, cmt?: string) => run(apiTransferMktToCs(id, qty, by, cmt)),
      transferCsToMkt: (id: string, qty: number, by: string) => run(apiTransferCsToMkt(id, qty, by)),
      manageConfig: (k: string, v: string) => run(apiManageConfig(k, v)),
      manageCategory: (a: 'add' | 'delete', n: string) => run(apiManageCategory(a, n)),
      addRemark: (skuId: string, remark: string, name: string, roleName: string) =>
        run(apiAddRemark(skuId, remark, name, roleName)),
      // Photo upload/delete don't change the data bundle by themselves —
      // the URL is saved via updateSku/addSku (which does refresh).
      uploadSkuImage: apiUploadSkuImage,
      deleteSkuImage: apiDeleteSkuImage,
      setSkuImage: apiSetSkuImage,
    };
  }, [refresh]);

  const value = useMemo<DataCtx>(() => ({
    loading,
    error,
    refresh,
    users: data?.users || [],
    skus: data?.skus || [],
    csSkus: data?.csSkus || [],
    tickets: data?.tickets || [],
    transactions: data?.transactions || [],
    csTransactions: data?.csTransactions || [],
    actions: data?.actions || [],
    categories: data?.categories || [],
    config: data?.config || {},
    remarks: data?.remarks || [],
    isDemo: data?.mode === 'demo',
    actionableTicketCount: actionCount,
    ...actions,
  }), [loading, error, refresh, data, actionCount, actions]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// small helper to access supabase + attach realtime in one place
export function useData(): DataCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

export function useHasActionable() {
  const { actionableTicketCount } = useData();
  return actionableTicketCount > 0;
}