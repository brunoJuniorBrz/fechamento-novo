
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useToast } from "@/hooks/use-toast";
import Navbar from '@/components/navbar';
import { format, parse, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';
import { BarChart, Filter, DollarSign, TrendingUp, TrendingDown, Building, Car, Truck, Bike, FileSearch, ClipboardPen, CreditCard, QrCode, Banknote, UserMinus, Receipt, Package, CheckCircle, ListChecks, type LucideIcon, Wallet, Landmark, Hourglass, TrendingDownIcon, AlertTriangle, ReceiptText, User as UserIconLc, CircleDollarSign } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { ChartContainer, ChartTooltip, ChartTooltipContent, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Legend, ResponsiveContainer, useChart, ChartProvider } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';


interface Profile {
  id: string;
  loja_id: string | null;
  nome_operador?: string | null;
  admin?: boolean | null;
}

interface CalculatedTotals { // Consistent with ClosingData and fechamentos table
    totalEntradasBrutas: number; totalEntradasEletronicas: number; totalSaidasOperacionais: number;
    totalSimoneSaidasOperacionais?: number; totalNovasContasAReceber: number;
    totalSaidasGeral: number; resultadoParcial: number; valorEmEspecieConferencia: number;
    totalReceivedPayments: number; totalEntradasComuns: number;
}
interface ClosingData { // From `fechamentos` table
    id: string; data_fechamento: string; loja_id: string; operator_name?: string | null;
    created_at: string;
    entradas: Record<string, number>; // JSONB
    entradas_eletronicas: { pix: number; cartao: number; deposito: number; }; // JSONB
    calculated_totals: CalculatedTotals; // JSONB
}
interface StoreAggregatedStats {
    totalEntradasBrutas: number; totalEntradasEletronicas: number; totalSaidasOperacionaisLoja: number;
    totalSaidasOperacionaisSimone: number; totalNovasContasAReceber: number; totalSaidasGeralConsolidado: number;
    resultadoParcialAgregado: number; valorEmEspecieConferenciaAgregado: number;
    totalContasAReceberPendentesLoja: number; valorLiquidoConferenciaSimone?: number; count: number; lojaId?: string;
}
interface ReceivableData { // From `contas_a_receber` table
    id: string; nome_cliente: string; placa: string | null; valor_receber: number; data_debito: string;
    loja_id: string; status: string; created_at: string; data_pagamento_efetivo: string | null; data_baixa_sistema: string | null;
}


const ADMIN_NAME = "Admin";
const formatCurrency = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value) || !isFinite(value)) return 'R$ 0,00';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};
const getStoreName = (lojaId: string | null | undefined): string => {
    if (!lojaId) return 'Desconhecida';
    if (lojaId === 'capao') return 'Top Capão Bonito';
    if (lojaId === 'guapiara') return 'Top Guapiara';
    if (lojaId === 'ribeirao') return 'Top Ribeirão Branco';
    if (lojaId === 'admin') return 'Caixa Simone';
    return lojaId;
};
const getGreeting = (): string => {
    const hour = new Date().getHours(); if (hour < 12) return 'Bom dia'; if (hour < 18) return 'Boa tarde'; return 'Boa noite';
};
const parseInputDate = (dateString: string): string | null => { // Returns YYYY-MM-DD
    if (!dateString || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return null;
    try { const parsedDate = parse(dateString, 'dd/MM/yyyy', new Date()); return isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : null; } catch (e) { return null; }
};

const entradaIdToLabelMap: Record<string, { label: string; icon: LucideIcon }> = {
    carro: { label: "Carro", icon: Car }, caminhonete: { label: "Caminhonete", icon: Truck }, caminhao: { label: "Caminhão", icon: Truck }, moto: { label: "Moto", icon: Bike },
    cautelar: { label: "Cautelar", icon: ClipboardPen }, revistoriaDetran: { label: "Revistoria DETRAN", icon: Building }, pesquisaProcedencia: { label: "Pesquisa de Procedência", icon: FileSearch },
};
const entradaEletronicaIdToLabelMap: Record<string, { label: string; icon: LucideIcon }> = {
    pix: { label: "Pix", icon: QrCode }, cartao: { label: "Cartão", icon: CreditCard }, deposito: { label: "Depósito", icon: Banknote },
};
const prices = { carro: 120, caminhonete: 140, caminhao: 180, moto: 100, cautelar: 220, revistoriaDetran: 200, pesquisaProcedencia: 60 };

const generateChartConfig = (map: Record<string, { label: string; icon?: LucideIcon }>): ChartConfig => {
  const config: ChartConfig = {};
  Object.entries(map).forEach(([key, value], index) => { config[value.label] = { label: value.label, icon: value.icon, color: `hsl(var(--chart-${(index % 5) + 1}))` }; });
  if (map === entradaIdToLabelMap) config['Recebimentos (Pendentes Pagos)'] = { label: 'Recebimentos (Pendentes Pagos)', icon: Wallet, color: `hsl(var(--chart-3))`};
  config['Saídas Operacionais (Diversas)'] = {label: 'Saídas Operacionais (Diversas)', icon: Receipt, color: `hsl(var(--chart-2))`}; // Using Receipt icon for operational expenses
  config['Novas Contas a Receber'] = {label: 'Novas Contas a Receber', icon: CircleDollarSign, color: `hsl(var(--chart-4))`};
  return config;
};
const entradaChartConfig = generateChartConfig(entradaIdToLabelMap);
const entradaEletronicaChartConfig = generateChartConfig(entradaEletronicaIdToLabelMap);
const saidasChartConfig = generateChartConfig({}); // Keep this generic for now
const ChartLegendContent = React.memo(({ payload }: { payload?: any[] }) => {
    const { config } = useChart(); if (!payload || !config) return null;
    return ( <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"> {payload.map((item) => { const name = item.payload?.name || item.name; const itemConfig = config[name as keyof typeof config]; if (!itemConfig) return null; const Icon = itemConfig?.icon; const label = itemConfig?.label || name; return ( <div key={name} className="flex items-center gap-1.5"> <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color, opacity: item.payload?.fillOpacity ?? 1 }} /> {Icon && <Icon className="h-3 w-3 text-muted-foreground" />} <span>{label}</span> </div> ); })} </div> );
});
ChartLegendContent.displayName = 'ChartLegendContent';

enum ReceivableFilterStatus { Pendente = 'pendente', PagoPendenteBaixa = 'pago_pendente_baixa', Baixado = 'baixado', Todos = 'todos' }

export default function AdminDashboardPage() {
    const router = useRouter(); const { toast } = useToast();
    const supabase = createClient();

    const [user, setUser] = React.useState<User | null>(null);
    const [profile, setProfile] = React.useState<Profile | null>(null);
    const [authLoading, setAuthLoading] = React.useState(true);

    const [dataLoading, setDataLoading] = React.useState(false);
    const [closingsData, setClosingsData] = React.useState<ClosingData[]>([]);
    const initialStoreStats: StoreAggregatedStats = { totalEntradasBrutas: 0, totalEntradasEletronicas: 0, totalSaidasOperacionaisLoja: 0, totalSaidasOperacionaisSimone: 0, totalNovasContasAReceber: 0, totalSaidasGeralConsolidado: 0, resultadoParcialAgregado: 0, valorEmEspecieConferenciaAgregado: 0, totalContasAReceberPendentesLoja: 0, valorLiquidoConferenciaSimone: 0, count: 0 };
    const [statsByStore, setStatsByStore] = React.useState<Record<string, StoreAggregatedStats>>({ capao: {...initialStoreStats, lojaId: 'capao'}, guapiara: {...initialStoreStats, lojaId: 'guapiara'}, ribeirao: {...initialStoreStats, lojaId: 'ribeirao'}, admin: {...initialStoreStats, lojaId: 'admin'} });
    const [overallTotalStats, setOverallTotalStats] = React.useState<StoreAggregatedStats>({...initialStoreStats});
    const [startDateInput, setStartDateInput] = React.useState<string>(''); const [endDateInput, setEndDateInput] = React.useState<string>('');
    const [selectedStoreFilter, setSelectedStoreFilter] = React.useState<string>('all'); // Renamed to avoid conflict
    const [greetingMessage, setGreetingMessage] = React.useState<string>('');
    const [entradasComunsChartData, setEntradasComunsChartData] = React.useState<any[]>([]);
    const [entradasEletronicasChartData, setEntradasEletronicasChartData] = React.useState<any[]>([]);
    const [saidasChartData, setSaidasChartData] = React.useState<any[]>([]);
    const [receivablesData, setReceivablesData] = React.useState<ReceivableData[]>([]);
    const [receivablesLoading, setReceivablesLoading] = React.useState(false);
    const [selectedReceivableStatus, setSelectedReceivableStatus] = React.useState<ReceivableFilterStatus>(ReceivableFilterStatus.PagoPendenteBaixa);


    React.useEffect(() => {
      setGreetingMessage(getGreeting());
      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
        setAuthLoading(true);
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, loja_id, nome_operador, admin')
            .eq('id', currentUser.id)
            .maybeSingle();

          if (profileError) {
            console.error("Error fetching profile for AdminPage:", profileError.message);
            toast({ variant: "destructive", title: "Erro de Perfil", description: "Não foi possível carregar dados do perfil. Redirecionando..." });
            setProfile(null);
            router.push('/login');
          } else {
            setProfile(profileData);
            if (!profileData?.admin) {
              toast({ variant: "destructive", title: "Acesso Negado", description: "Você não tem permissão para acessar esta página." });
              router.push('/');
            } else {
              const today = new Date();
              const sevenDaysAgo = new Date(today);
              sevenDaysAgo.setDate(today.getDate() - 7);
              const initialStartDate = format(sevenDaysAgo, 'yyyy-MM-dd');
              const initialEndDate = format(today, 'yyyy-MM-dd');
              setStartDateInput(format(sevenDaysAgo, 'dd/MM/yyyy'));
              setEndDateInput(format(today, 'dd/MM/yyyy'));
              fetchAllClosingsData(initialStartDate, initialEndDate, 'all');
              fetchReceivablesData('all', selectedReceivableStatus);
            }
          }
        } else {
          setProfile(null);
          router.push('/login');
        }
        setAuthLoading(false);
      });
        const initialCheck = async () => { /* ... identical to above ... */ }; // Placeholder for brevity
        initialCheck();
      return () => { authListener.subscription.unsubscribe(); };
    }, [supabase, router, toast]);


    const fetchAllClosingsData = async (startDate: string | null, endDate: string | null, currentStore: string) => {
        if (!profile?.admin) return;
        setDataLoading(true);
        let query = supabase.from('fechamentos').select('*');
        if (startDate) query = query.gte('data_fechamento', startDate);
        if (endDate) query = query.lte('data_fechamento', endDate);
        if (currentStore !== 'all') query = query.eq('loja_id', currentStore);
        query = query.order('data_fechamento', { ascending: false });

        const { data, error } = await query;

        if (error) {
            toast({ variant: "destructive", title: "Erro ao buscar fechamentos", description: error.message });
            setClosingsData([]);
        } else {
            setClosingsData(data as ClosingData[] || []);
            aggregateStats(data as ClosingData[] || []);
            generateChartData(data as ClosingData[] || []);
        }
        setDataLoading(false);
    };

    const fetchReceivablesData = async (storeFilter: string, statusFilter: ReceivableFilterStatus) => {
        if (!profile?.admin) return;
        setReceivablesLoading(true);
        let query = supabase.from('contas_a_receber').select('*');
        if (storeFilter !== 'all') query = query.eq('loja_id', storeFilter);
        if (statusFilter !== ReceivableFilterStatus.Todos) query = query.eq('status', statusFilter);
        query = query.order('data_debito', { ascending: false });

        const { data, error } = await query;
        if (error) {
            toast({ variant: "destructive", title: "Erro ao buscar contas a receber", description: error.message });
            setReceivablesData([]);
        } else {
            setReceivablesData(data as ReceivableData[] || []);
        }
        setReceivablesLoading(false);
    };

    const aggregateStats = async (allClosings: ClosingData[]) => {
        const newStatsByStore: Record<string, StoreAggregatedStats> = {
            capao: { ...initialStoreStats, lojaId: 'capao' },
            guapiara: { ...initialStoreStats, lojaId: 'guapiara' },
            ribeirao: { ...initialStoreStats, lojaId: 'ribeirao' },
            admin: { ...initialStoreStats, lojaId: 'admin' } // For Simone's own entries if any direct ones
        };
        const newOverallStats: StoreAggregatedStats = { ...initialStoreStats };

        for (const closing of allClosings) {
            const totals = closing.calculated_totals;
            if (!totals) continue;

            const storeId = closing.loja_id;
            if (!newStatsByStore[storeId]) { // Should not happen if all stores are pre-initialized
                 newStatsByStore[storeId] = { ...initialStoreStats, lojaId: storeId };
            }

            newStatsByStore[storeId].count++;
            newStatsByStore[storeId].totalEntradasBrutas += totals.totalEntradasBrutas || 0;
            newStatsByStore[storeId].totalEntradasEletronicas += totals.totalEntradasEletronicas || 0;
            newStatsByStore[storeId].totalSaidasOperacionaisLoja += totals.totalSaidasOperacionais || 0; // Assumes all 'saidasOperacionais' are from the store itself
            newStatsByStore[storeId].totalSaidasOperacionaisSimone += totals.totalSimoneSaidasOperacionais || 0;
            newStatsByStore[storeId].totalNovasContasAReceber += totals.totalNovasContasAReceber || 0;
            newStatsByStore[storeId].totalSaidasGeralConsolidado += totals.totalSaidasGeral || 0;
            newStatsByStore[storeId].resultadoParcialAgregado += totals.resultadoParcial || 0;
            newStatsByStore[storeId].valorEmEspecieConferenciaAgregado += totals.valorEmEspecieConferencia || 0;

            // Fetch pending A/R for this store if not admin store
            if (storeId !== 'admin') {
                 const { data: pendingAR, error: arError } = await supabase
                    .from('contas_a_receber')
                    .select('valor_receber')
                    .eq('loja_id', storeId)
                    .eq('status', 'pendente');
                if (!arError && pendingAR) {
                    newStatsByStore[storeId].totalContasAReceberPendentesLoja = pendingAR.reduce((sum, item) => sum + item.valor_receber, 0);
                }
            }
        }
        
        // Calculate overall totals by summing up store stats
        Object.values(newStatsByStore).forEach(storeData => {
            newOverallStats.count += storeData.count;
            newOverallStats.totalEntradasBrutas += storeData.totalEntradasBrutas;
            newOverallStats.totalEntradasEletronicas += storeData.totalEntradasEletronicas;
            newOverallStats.totalSaidasOperacionaisLoja += storeData.totalSaidasOperacionaisLoja;
            newOverallStats.totalSaidasOperacionaisSimone += storeData.totalSaidasOperacionaisSimone;
            newOverallStats.totalNovasContasAReceber += storeData.totalNovasContasAReceber;
            newOverallStats.totalSaidasGeralConsolidado += storeData.totalSaidasGeralConsolidado;
            newOverallStats.resultadoParcialAgregado += storeData.resultadoParcialAgregado;
            newOverallStats.valorEmEspecieConferenciaAgregado += storeData.valorEmEspecieConferenciaAgregado;
            // totalContasAReceberPendentesLoja is per store, not summed overall for this particular display
        });

        // Calculate valorLiquidoConferenciaSimone for each store (except 'admin' store itself, which is Simone's direct box)
        Object.keys(newStatsByStore).forEach(storeId => {
            if (storeId !== 'admin' && newStatsByStore[storeId].count > 0) {
                 newStatsByStore[storeId].valorLiquidoConferenciaSimone = 
                    (newStatsByStore[storeId].totalEntradasBrutas || 0) -
                    (newStatsByStore[storeId].totalSaidasOperacionaisLoja || 0) - // Only store's operational exits
                    (newStatsByStore[storeId].totalContasAReceberPendentesLoja || 0);
            } else if (storeId === 'admin' && newStatsByStore[storeId].count > 0) { // Simone's "Caixa"
                 newStatsByStore[storeId].valorLiquidoConferenciaSimone = newStatsByStore[storeId].valorEmEspecieConferenciaAgregado;
            }
        });
        setStatsByStore(newStatsByStore);
        setOverallTotalStats(newOverallStats);
    };
    
    const generateChartData = (closings: ClosingData[]) => {
        const commonEntriesAgg: Record<string, number> = {};
        const electronicEntriesAgg: Record<string, number> = {};
        let totalSaidasOpDiversas = 0;
        let totalNovasAR = 0;

        closings.forEach(closing => {
            // Aggregate common entries
            Object.entries(closing.entradas || {}).forEach(([key, quantity]) => {
                const label = entradaIdToLabelMap[key]?.label || key;
                const price = prices[key as keyof typeof prices] || 0;
                commonEntriesAgg[label] = (commonEntriesAgg[label] || 0) + (quantity * price);
            });
            // Aggregate received payments into common entries chart
            if (closing.calculated_totals?.totalReceivedPayments > 0) {
                 const receivedLabel = 'Recebimentos (Pendentes Pagos)';
                 commonEntriesAgg[receivedLabel] = (commonEntriesAgg[receivedLabel] || 0) + closing.calculated_totals.totalReceivedPayments;
            }

            // Aggregate electronic entries
            Object.entries(closing.entradas_eletronicas || {}).forEach(([key, value]) => {
                const label = entradaEletronicaIdToLabelMap[key]?.label || key;
                if (value > 0) electronicEntriesAgg[label] = (electronicEntriesAgg[label] || 0) + value;
            });

            // Aggregate operational exits and new A/R for the "Saídas" chart
            totalSaidasOpDiversas += closing.calculated_totals?.totalSaidasOperacionais || 0;
            totalSaidasOpDiversas += closing.calculated_totals?.totalSimoneSaidasOperacionais || 0; // Include Simone's specific exits if admin
            totalNovasAR += closing.calculated_totals?.totalNovasContasAReceber || 0;
        });

        setEntradasComunsChartData(Object.entries(commonEntriesAgg).map(([name, total], index) => ({ name, total, fill: `hsl(var(--chart-${(index % 5) + 1}))` })));
        setEntradasEletronicasChartData(Object.entries(electronicEntriesAgg).map(([name, total], index) => ({ name, total, fill: `hsl(var(--chart-${(index % 5) + 1}))` })));
        
        const saidasAggChart = [];
        if (totalSaidasOpDiversas > 0) saidasAggChart.push({ name: 'Saídas Operacionais (Diversas)', total: totalSaidasOpDiversas, fill: `hsl(var(--chart-2))` });
        if (totalNovasAR > 0) saidasAggChart.push({ name: 'Novas Contas a Receber', total: totalNovasAR, fill: `hsl(var(--chart-4))` });
        setSaidasChartData(saidasAggChart);
    };


    const handleApplyClosingFilters = () => {
        const startDate = parseInputDate(startDateInput); const endDate = parseInputDate(endDateInput);
        fetchAllClosingsData(startDate, endDate || startDate, selectedStoreFilter); // Use selectedStoreFilter
    };

    React.useEffect(() => {
        if (profile?.admin) { // Only refetch receivables if admin profile is loaded
            fetchReceivablesData(selectedStoreFilter, selectedReceivableStatus);
        }
    }, [selectedStoreFilter, selectedReceivableStatus, profile?.admin]); // Add profile.admin dependency

    const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<string>>) => {
        let value = e.target.value.replace(/\D/g, ''); if (value.length > 8) value = value.slice(0, 8);
        let formattedValue = '';
        if (value.length > 4) formattedValue = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
        else if (value.length > 2) formattedValue = `${value.slice(0, 2)}/${value.slice(2)}`;
        else formattedValue = value;
        setter(formattedValue);
    };

     const handleDarBaixa = async (receivableId: string) => {
        if (!profile?.admin) {
            toast({ variant: "destructive", title: "Ação não permitida." });
            return;
        }
        const { error } = await supabase
            .from('contas_a_receber')
            .update({ status: 'baixado', data_baixa_sistema: new Date().toISOString(), user_id_baixa: user?.id })
            .eq('id', receivableId);

        if (error) {
            toast({ variant: "destructive", title: "Erro ao dar baixa", description: error.message });
        } else {
            toast({ title: "Sucesso!", description: "Baixa na conta a receber realizada." });
            fetchReceivablesData(selectedStoreFilter, selectedReceivableStatus); // Refresh list
        }
     };
     const getReceivableBadgeVariant = (receivable: ReceivableData): "destructive" | "secondary" | "outline" | "default" => {
         if (receivable.status === 'pendente') return "destructive";
         if (receivable.status === 'pago_pendente_baixa') return "secondary";
         if (receivable.status === 'baixado') return "outline";
         return "default";
     };
     const getReceivableBadgeText = (receivable: ReceivableData): string => {
         if (receivable.status === 'pendente') return "Pendente";
         if (receivable.status === 'pago_pendente_baixa') return "Pago (Aguard. Baixa)";
         if (receivable.status === 'baixado') return "Baixado";
         return receivable.status;
     };

    if (authLoading || (!profile && !authLoading)) {
        return (
            <div className="flex flex-col min-h-screen">
                <Navbar />
                <main className="flex-grow container mx-auto px-4 md:px-8 py-8 flex items-center justify-center">
                    <p>Carregando dados do administrador...</p>
                </main>
            </div>
        );
    }
    if (!profile?.admin) { // Should have been redirected by useEffect, but as a fallback
        return (
            <div className="flex flex-col min-h-screen">
                <Navbar />
                <main className="flex-grow container mx-auto p-8 text-center">
                    <p>Acesso negado.</p>
                    <Button onClick={() => router.push('/')} className="mt-4">Voltar para Home</Button>
                </main>
            </div>
        );
    }


    return (
            <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
                <Navbar />
                <main className="flex-grow container mx-auto px-4 md:px-8 py-8">
                    <h1 className="text-3xl font-bold text-foreground mb-2">{greetingMessage}, {profile?.nome_operador || ADMIN_NAME}!</h1>
                    <p className="text-muted-foreground mb-8">Painel de administrador.</p>

                     <Card className="mb-8 shadow-md border border-border/50">
                         <CardHeader><CardTitle className="text-xl flex items-center gap-2"><Filter className="h-5 w-5"/>Filtros</CardTitle><CardDescription>Selecione período e loja.</CardDescription></CardHeader>
                         <CardContent className="flex flex-wrap items-end gap-4">
                             <div className="flex-grow space-y-1"><Label>Período Fechamentos</Label><div className="flex flex-col sm:flex-row gap-2"><Input type="text" placeholder="DD/MM/AAAA" value={startDateInput} onChange={(e) => handleDateInputChange(e, setStartDateInput)} className="h-10 w-full sm:w-[140px]" maxLength={10} /><span className="text-muted-foreground self-center hidden sm:inline">até</span><Input type="text" placeholder="DD/MM/AAAA" value={endDateInput} onChange={(e) => handleDateInputChange(e, setEndDateInput)} className="h-10 w-full sm:w-[140px]" maxLength={10} /></div></div>
                              <div className="space-y-1 w-full sm:w-auto min-w-[160px]"><Label htmlFor="store-select">Loja</Label><Select value={selectedStoreFilter} onValueChange={setSelectedStoreFilter}><SelectTrigger id="store-select" className="w-full h-10"><SelectValue placeholder="Selecione Loja" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as Lojas</SelectItem><SelectItem value="admin">Caixa Simone</SelectItem><SelectItem value="capao">Top Capão Bonito</SelectItem><SelectItem value="guapiara">Top Guapiara</SelectItem><SelectItem value="ribeirao">Top Ribeirão Branco</SelectItem></SelectContent></Select></div>
                             <Button onClick={handleApplyClosingFilters} disabled={dataLoading} className="h-10">{dataLoading ? 'Buscando...' : 'Aplicar Filtros'}</Button>
                         </CardContent>
                     </Card>

                     <Card className="mb-8 shadow-md border border-border/50">
                         <CardHeader><CardTitle className="text-xl flex items-center gap-2"><BarChart className="h-5 w-5"/>Estatísticas Gerais ({dataLoading ? '...' : overallTotalStats.count} Fechamentos)</CardTitle><CardDescription>Resumo financeiro consolidado.</CardDescription></CardHeader>
                         <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="p-4 bg-success/5 rounded-lg border border-success/20"><h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1"><TrendingUp className="h-4 w-4 text-success" />Entr. Brutas</h3>{dataLoading ? <Skeleton className="h-8 w-3/4 mt-1" /> : <p className="text-2xl font-bold text-success">{formatCurrency(overallTotalStats.totalEntradasBrutas)}</p>}</div>
                            <div className="p-4 bg-blue-500/5 rounded-lg border border-blue-500/20"><h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1"><CreditCard className="h-4 w-4 text-blue-500" />Entr. Eletrônicas</h3>{dataLoading ? <Skeleton className="h-8 w-3/4 mt-1" /> : <p className="text-2xl font-bold text-blue-600">{formatCurrency(overallTotalStats.totalEntradasEletronicas)}</p>}</div>
                            <div className="p-4 bg-destructive/5 rounded-lg border border-destructive/20"><h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1"><TrendingDownIcon className="h-4 w-4 text-destructive" />Saídas Gerais</h3>{dataLoading ? <Skeleton className="h-8 w-3/4 mt-1" /> : <p className="text-2xl font-bold text-destructive">{formatCurrency(overallTotalStats.totalSaidasGeralConsolidado)}</p>}</div>
                            <div className="p-4 bg-indigo-500/5 rounded-lg border border-indigo-500/20"><h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1"><ReceiptText className="h-4 w-4 text-indigo-500" />Saídas Op. (Loja)</h3>{dataLoading ? <Skeleton className="h-8 w-3/4 mt-1" /> : <p className="text-2xl font-bold text-indigo-600">{formatCurrency(overallTotalStats.totalSaidasOperacionaisLoja)}</p>}</div>
                            {overallTotalStats.totalSaidasOperacionaisSimone > 0 && (<div className="p-4 bg-pink-500/5 rounded-lg border border-pink-500/20"><h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1"><UserMinus className="h-4 w-4 text-pink-500" />Saídas Op. (Simone)</h3>{dataLoading ? <Skeleton className="h-8 w-3/4 mt-1" /> : <p className="text-2xl font-bold text-pink-600">{formatCurrency(overallTotalStats.totalSaidasOperacionaisSimone)}</p>}</div>)}
                            <div className="p-4 bg-orange-500/5 rounded-lg border border-orange-500/20"><h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1"><CircleDollarSign className="h-4 w-4 text-orange-500" />Novas A/R</h3>{dataLoading ? <Skeleton className="h-8 w-3/4 mt-1" /> : <p className="text-2xl font-bold text-orange-600">{formatCurrency(overallTotalStats.totalNovasContasAReceber)}</p>}</div>
                            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 col-span-1 sm:col-span-2 lg:col-span-3"><h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1"><Coins className="h-4 w-4 text-primary" />Valor em Espécie</h3>{dataLoading ? <Skeleton className="h-8 w-1/2 mt-1" /> : (<p className={`text-2xl font-bold ${overallTotalStats.valorEmEspecieConferenciaAgregado >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatCurrency(overallTotalStats.valorEmEspecieConferenciaAgregado)}</p>)}<p className="text-xs text-muted-foreground mt-1">(Entr. Brutas - Saídas Gerais - Entr. Eletrônicas)</p></div>
                         </CardContent>
                          { (selectedStoreFilter === 'all' || selectedStoreFilter === 'admin') && !dataLoading && Object.values(statsByStore).some(s => s.count > 0) && (
                            <CardFooter className="pt-4 border-t border-border/40 mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Object.entries(statsByStore).filter(([, storeData]) => storeData.count > 0).map(([storeId, storeData]) => ( <div key={storeId} className="p-3 bg-muted/30 rounded-md border border-border/50"><h4 className="text-sm font-semibold text-foreground mb-1">{getStoreName(storeData.lojaId)} ({storeData.count} fech.)</h4><div className="text-xs space-y-0.5"><p className="text-success">Entr. Brutas: {formatCurrency(storeData.totalEntradasBrutas)}</p><p className="text-blue-600">Entr. Eletrôn.: {formatCurrency(storeData.totalEntradasEletronicas)}</p><p className="text-destructive">Saídas Gerais: {formatCurrency(storeData.totalSaidasGeralConsolidado)}</p><p className={`font-medium ${storeData.valorEmEspecieConferenciaAgregado >= 0 ? 'text-primary' : 'text-destructive'}`}>Espécie Conf.: {formatCurrency(storeData.valorEmEspecieConferenciaAgregado)}</p>{storeId !== 'admin' && storeData.valorLiquidoConferenciaSimone !== undefined && ( <><Separator className="my-1"/><p className="text-muted-foreground">A Receber (Pend.): {formatCurrency(storeData.totalContasAReceberPendentesLoja)}</p><p className={`font-bold ${storeData.valorLiquidoConferenciaSimone >= 0 ? 'text-teal-600' : 'text-red-700'}`}>Líquido Conf. (Simone): {formatCurrency(storeData.valorLiquidoConferenciaSimone)}</p></>)}{storeData.lojaId === 'admin' && storeData.valorLiquidoConferenciaSimone !== undefined && ( <><Separator className="my-1"/><p className={`font-bold ${storeData.valorLiquidoConferenciaSimone >= 0 ? 'text-teal-600' : 'text-red-700'}`}>Líquido Conf. (Simone): {formatCurrency(storeData.valorLiquidoConferenciaSimone)}</p></>)}</div></div>))}
                            </CardFooter>
                          )}
                     </Card>

                     <Card className="mb-8 shadow-md border border-purple-500/30">
                         <CardHeader className="bg-purple-500/5"><CardTitle className="text-xl flex items-center gap-2 text-purple-700"><UserIconLc className="h-5 w-5"/>Visão Detalhada (Simone)</CardTitle><CardDescription>Cálculo para conferência da Simone.</CardDescription></CardHeader>
                         <CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Loja</TableHead><TableHead className="text-right">Entr. Totais</TableHead><TableHead className="text-right">Entr. Eletrônicas</TableHead><TableHead className="text-right">Saídas Totais</TableHead><TableHead className="text-right">A Receber (Pend.)</TableHead><TableHead className="text-right font-bold">Valor Líquido (Simone)</TableHead></TableRow></TableHeader><TableBody>{dataLoading ? ([...Array(1)].map((_, i) => <TableRow key={`skel-simone-${i}`}><TableCell colSpan={6}><Skeleton className="h-8 w-full my-1"/></TableCell></TableRow>)) : Object.values(statsByStore).filter((storeData) => storeData.count > 0 && (selectedStoreFilter === 'all' || selectedStoreFilter === 'admin' || selectedStoreFilter === storeData.lojaId )).length > 0 ? (Object.values(statsByStore).filter((storeData) => storeData.count > 0 && (selectedStoreFilter === 'all' || selectedStoreFilter === 'admin' || selectedStoreFilter === storeData.lojaId )).map((sData) => (<TableRow key={sData.lojaId || 'overall-simone'}><TableCell className="font-medium">{getStoreName(sData.lojaId!)}</TableCell><TableCell className="text-right">{formatCurrency(sData.totalEntradasBrutas)}</TableCell><TableCell className="text-right">{formatCurrency(sData.totalEntradasEletronicas)}</TableCell><TableCell className="text-right">{formatCurrency(sData.totalSaidasGeralConsolidado)}</TableCell><TableCell className="text-right">{sData.lojaId !== 'admin' ? formatCurrency(sData.totalContasAReceberPendentesLoja) : '-'}</TableCell><TableCell className={`text-right font-bold ${sData.valorLiquidoConferenciaSimone !== undefined && sData.valorLiquidoConferenciaSimone >=0 ? 'text-purple-700' : 'text-red-700'}`}>{sData.valorLiquidoConferenciaSimone !== undefined ? formatCurrency(sData.valorLiquidoConferenciaSimone) : '-'}</TableCell></TableRow>))) : (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">Nenhum dado com filtros atuais.</TableCell></TableRow>)}</TableBody></Table></CardContent>
                         <CardFooter className="text-xs text-muted-foreground p-4 border-t">* Valor Líquido (Simone) = Entr. Totais (Loja) - Saídas Op. (Loja) - A Receber (Total Pendente Loja).</CardFooter>
                     </Card>

                     <Card className="mb-8 shadow-md border border-border/50">
                         <CardHeader><div className="flex justify-between items-start gap-4"><div><CardTitle className="text-xl flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" />Contas a Receber</CardTitle><CardDescription>Lista de contas a receber.</CardDescription></div><div className="space-y-1 w-full sm:w-auto min-w-[180px] flex-shrink-0"><Label htmlFor="receivable-status-select" className="text-xs">Status A/R</Label><Select value={selectedReceivableStatus} onValueChange={(value) => setSelectedReceivableStatus(value as ReceivableFilterStatus)}><SelectTrigger id="receivable-status-select" className="w-full h-9"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value={ReceivableFilterStatus.Pendente}>Pendentes</SelectItem><SelectItem value={ReceivableFilterStatus.PagoPendenteBaixa}>Pagos (Aguard. Baixa)</SelectItem><SelectItem value={ReceivableFilterStatus.Baixado}>Baixados</SelectItem><SelectItem value={ReceivableFilterStatus.Todos}>Todos</SelectItem></SelectContent></Select></div></div></CardHeader>
                         <CardContent>{receivablesLoading ? (<div className="space-y-4">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>) : receivablesData.length > 0 ? (<div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Placa</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Data Débito</TableHead><TableHead>Loja</TableHead><TableHead>Status</TableHead><TableHead>Data Pag.</TableHead><TableHead>Data Baixa</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{receivablesData.map((receivable) => { let fdd = 'Inv.'; try{const p = parse(receivable.data_debito,'yyyy-MM-dd',new Date()); if(isValid(p)) fdd=format(p,'dd/MM/yy');}catch(e){} let fpd = '-'; if(receivable.data_pagamento_efetivo){try{fpd=format(parseISO(receivable.data_pagamento_efetivo),'dd/MM/yy HH:mm');}catch(e){}} let fbd = '-'; if(receivable.data_baixa_sistema){try{fbd=format(parseISO(receivable.data_baixa_sistema),'dd/MM/yy HH:mm');}catch(e){}} return (<TableRow key={receivable.id}><TableCell className="font-medium">{receivable.nome_cliente||'N/A'}</TableCell><TableCell>{receivable.placa||'N/A'}</TableCell><TableCell className="text-right">{formatCurrency(receivable.valor_receber)}</TableCell><TableCell>{fdd}</TableCell><TableCell>{getStoreName(receivable.loja_id)}</TableCell><TableCell><Badge variant={getReceivableBadgeVariant(receivable)} className="whitespace-nowrap">{getReceivableBadgeText(receivable)}</Badge></TableCell><TableCell className="text-xs">{fpd}</TableCell><TableCell className="text-xs">{fbd}</TableCell><TableCell className="text-right">{receivable.status === 'pago_pendente_baixa' && (<AlertDialog><AlertDialogTrigger asChild><Button variant="outline" size="sm" className="text-xs h-7 px-2"><CheckCircle className="h-3 w-3 mr-1"/>Dar Baixa</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar Baixa?</AlertDialogTitle><AlertDialogDescription>Dar baixa na conta de {receivable.nome_cliente||'Cliente'} ({formatCurrency(receivable.valor_receber)})?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={()=>handleDarBaixa(receivable.id)} className="bg-success hover:bg-success/90">Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>)}</TableCell></TableRow>);})}</TableBody></Table></div>) : (<p className="text-center text-muted-foreground py-6">Nenhuma conta a receber encontrada para os filtros selecionados.</p>)} </CardContent>
                     </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        <Card className="shadow-md border border-border/50"><CardHeader><CardTitle>Entradas Comuns e Recebimentos</CardTitle></CardHeader><CardContent className="aspect-video">{dataLoading ? <Skeleton className="w-full h-full" /> : entradasComunsChartData.length > 0 ? (<ChartProvider config={entradaChartConfig}><ChartContainer className="min-h-[200px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel hideIndicator formatter={(v,n)=>(<div className="flex items-center justify-between w-full min-w-[150px]"><span className="text-muted-foreground mr-2">{n}:</span><span className="font-bold">{formatCurrency(v as number)}</span></div>)} />} /><Pie data={entradasComunsChartData} dataKey="total" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>{entradasComunsChartData.map((entry, index) => ( <Cell key={`cell-entrada-${index}`} fill={entry.fill} /> ))}</Pie><Legend content={<ChartLegendContent />} /></PieChart></ResponsiveContainer></ChartContainer></ChartProvider>) : ( <p className="text-center text-muted-foreground py-10">Sem dados para o gráfico.</p> )}</CardContent></Card>
                        <Card className="shadow-md border border-border/50"><CardHeader><CardTitle>Entradas Eletrônicas</CardTitle></CardHeader><CardContent className="aspect-video">{dataLoading ? <Skeleton className="w-full h-full" /> : entradasEletronicasChartData.length > 0 ? (<ChartProvider config={entradaEletronicaChartConfig}><ChartContainer className="min-h-[200px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel hideIndicator formatter={(v,n)=>(<div className="flex items-center justify-between w-full min-w-[150px]"><span className="text-muted-foreground mr-2">{n}:</span><span className="font-bold">{formatCurrency(v as number)}</span></div>)} />} /><Pie data={entradasEletronicasChartData} dataKey="total" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>{entradasEletronicasChartData.map((entry, index) => ( <Cell key={`cell-eletronica-${index}`} fill={entry.fill} /> ))}</Pie><Legend content={<ChartLegendContent />} /></PieChart></ResponsiveContainer></ChartContainer></ChartProvider>) : ( <p className="text-center text-muted-foreground py-10">Sem dados para o gráfico.</p> )}</CardContent></Card>
                        <Card className="shadow-md border border-border/50 lg:col-span-2"><CardHeader><CardTitle>Saídas e Novas A/R</CardTitle></CardHeader><CardContent className="aspect-video">{dataLoading ? <Skeleton className="w-full h-full" /> : saidasChartData.length > 0 ? (<ChartProvider config={saidasChartConfig}><ChartContainer className="min-h-[200px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel hideIndicator formatter={(v,n)=>(<div className="flex items-center justify-between w-full min-w-[150px]"><span className="text-muted-foreground mr-2">{n}:</span><span className="font-bold">{formatCurrency(v as number)}</span></div>)} />} /><Pie data={saidasChartData} dataKey="total" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>{saidasChartData.map((entry, index) => ( <Cell key={`cell-saida-agg-${index}`} fill={entry.fill} /> ))}</Pie><Legend content={<ChartLegendContent />} /></PieChart></ResponsiveContainer></ChartContainer></ChartProvider>) : ( <p className="text-center text-muted-foreground py-10">Sem dados para o gráfico.</p> )}</CardContent></Card>
                    </div>

                     <Card className="shadow-md border border-border/50">
                        <CardHeader><CardTitle className="text-xl flex items-center gap-2"><ListChecks className="h-5 w-5"/>Histórico de Fechamentos</CardTitle><CardDescription>Lista de fechamentos recentes.</CardDescription></CardHeader>
                        <CardContent>{dataLoading ? (<div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full"/>)}</div>) : closingsData.length > 0 ? (<ul className="space-y-3">{closingsData.map((closing) => { let fcd = 'Data Inválida'; try {const cd = parse(closing.data_fechamento,"yyyy-MM-dd",new Date()); if(isValid(cd)){fcd = format(cd,"PPP",{locale:ptBR});}}catch(e){} const ct = closing.calculated_totals; return (<li key={closing.id} className="border border-border/40 bg-background p-4 rounded-lg flex flex-wrap justify-between items-center gap-3 hover:bg-muted/40 transition-colors"><div className="flex-1 min-w-0"><span className="font-semibold text-foreground block">{fcd}<span className="text-sm text-muted-foreground ml-2">({getStoreName(closing.loja_id)})</span>{closing.operator_name && <span className="text-xs text-muted-foreground block md:inline ml-1">(Op: {closing.operator_name})</span>}</span>{ct && (<div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mt-1"><span className="text-success">Entr.Brutas: {formatCurrency(ct.totalEntradasBrutas)}</span><span className="text-blue-600">Entr.Eletrôn.: {formatCurrency(ct.totalEntradasEletronicas)}</span><span className="text-destructive">Saídas Gerais: {formatCurrency(ct.totalSaidasGeral)}</span><span className={`font-medium ${ct.valorEmEspecieConferencia >= 0 ? 'text-primary':'text-destructive'}`}>Espécie: {formatCurrency(ct.valorEmEspecieConferencia)}</span></div>)}</div><Button variant="outline" size="sm" onClick={() => router.push(`/historico/${closing.data_fechamento}?adminView=true&lojaId=${closing.loja_id}&docId=${closing.id}`)}>Ver Detalhes</Button></li>);})}</ul>) : (<p className="text-center text-muted-foreground py-6">Nenhum fechamento encontrado para os filtros selecionados.</p>)}</CardContent>
                     </Card>
                </main>
            </div>
    );
}
    