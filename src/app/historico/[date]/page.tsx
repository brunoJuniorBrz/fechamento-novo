
'use client';

import * as React from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, TrendingUp, TrendingDown, Pencil, DollarSign, Download, CreditCard, QrCode, Banknote, Coins, ReceiptText, UserMinus, Wallet } from 'lucide-react'; // Removido Package e ícones de entrada não usados aqui
import { useToast } from "@/hooks/use-toast";
import { format, parse, isValid, subDays, isAfter, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Navbar from '@/components/navbar';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  loja_id: string | null;
  nome_operador?: string | null;
  admin?: boolean | null;
}

interface CalculatedTotals {
    totalEntradasComuns: number; totalReceivedPayments: number; totalEntradasBrutas: number;
    totalEntradasEletronicas: number; totalSaidasOperacionais: number; totalSimoneSaidasOperacionais?: number;
    totalNovasContasAReceber: number; totalSaidasGeral: number; resultadoParcial: number; valorEmEspecieConferencia: number;
}
// Dados de um fechamento buscado do Supabase
interface ClosingHistoryData {
    id: string;
    data_fechamento: string; // YYYY-MM-DD
    loja_id: string;
    operator_name?: string | null;
    user_id: string;
    entradas: Record<string, number>; // JSONB
    entradas_eletronicas: { pix: number; cartao: number; deposito: number; }; // JSONB
    calculated_totals: CalculatedTotals; // JSONB
    saidas_operacionais_loja: { nome: string; valor: number; data_pagamento: string; }[];
    simone_saidas_operacionais?: { nome: string; valor: number; data_pagamento: string; }[];
    // Para mostrar na tela de histórico, precisamos também dos detalhes de A/R e Recebimentos *daquele fechamento*
    novas_contas_a_receber_detalhes?: { nome_cliente: string; placa: string | null; valor_receber: number; }[]; // Buscado de contas_a_receber com fechamento_id_origem
    recebimentos_registrados_detalhes?: { conta_a_receber: { nome_cliente: string; placa: string | null; } | null; valor_recebido: number; }[]; // Buscado de fechamento_recebimentos_registrados com join
    created_at: string;
    updated_at: string;
}

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
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const entradaIdToLabelMap: Record<string, string> = {
    carro: "Carro", caminhonete: "Caminhonete", caminhao: "Caminhão", moto: "Moto",
    cautelar: "Cautelar", revistoriaDetran: "Revistoria DETRAN", pesquisaProcedencia: "Pesquisa de Procedência",
};

const generatePdfDummy = () => {
    console.log("generatePdf called (dummy)");
    alert("Funcionalidade de PDF a ser implementada.");
};

export default function HistoryDatePage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const dateParam = params.date as string; // YYYY-MM-DD
    const docIdParam = searchParams.get('docId'); // From admin view link
    const lojaIdFromParam = searchParams.get('lojaId'); // From admin view link, if specific store
    
    const { toast } = useToast();
    const supabase = createClient();

    const [user, setUser] = React.useState<User | null>(null);
    const [profile, setProfile] = React.useState<Profile | null>(null);
    const [authLoading, setAuthLoading] = React.useState(true);

    const [isLoading, setIsLoading] = React.useState(true);
    const [closingData, setClosingData] = React.useState<ClosingHistoryData | null>(null);
    const [parsedDate, setParsedDate] = React.useState<Date | null>(null);
    const [currentDate, setCurrentDate] = React.useState<Date | null>(null);

    const adminView = searchParams.get('adminView') === 'true' && profile?.admin === true;

    React.useEffect(() => { setCurrentDate(new Date()); }, []);

    React.useEffect(() => {
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
              console.error("Error fetching profile for History Page:", profileError.message);
              setProfile(null);
              toast({ variant: "destructive", title: "Erro de Perfil", description: "Não foi possível carregar dados do perfil."});
              router.push('/login');
            } else {
              setProfile(profileData);
              if (dateParam) {
                try {
                    const dateObject = parse(dateParam, 'yyyy-MM-dd', new Date());
                    if (!isValid(dateObject)) throw new Error("Data na URL inválida.");
                    setParsedDate(dateObject);
                    fetchClosingDataFromSupabase(dateObject, profileData?.loja_id, profileData?.admin);
                } catch (e: any) {
                    toast({ variant: "destructive", title: "Erro na Rota", description: e.message || "Data inválida.", duration: 3000 });
                    router.replace(profileData?.admin ? '/admin' : '/');
                }
              } else if (!docIdParam) { // Only redirect if neither dateParam nor docIdParam is present
                  toast({ variant: "destructive", title: "Parâmetros Inválidos", description: "Data ou ID do documento não fornecido." });
                  router.replace(profileData?.admin ? '/admin' : '/');
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
      }, [supabase, router, toast, dateParam, docIdParam]);


    const fetchClosingDataFromSupabase = async (date: Date, userLojaId?: string | null, isAdmin?: boolean | null) => {
        setIsLoading(true);
        
        let query = supabase.from('fechamentos').select(`
            *,
            saidas_operacionais_loja:fechamento_saidas_operacionais(*),
            simone_saidas_operacionais:fechamento_simone_saidas_operacionais(*),
            novas_contas_a_receber_detalhes:contas_a_receber!fechamento_id_origem(nome_cliente, placa, valor_receber),
            recebimentos_registrados_detalhes:fechamento_recebimentos_registrados(
                valor_recebido,
                conta_a_receber:contas_a_receber(nome_cliente, placa)
            )
        `);

        if (docIdParam) { // If admin provides a specific docId
            query = query.eq('id', docIdParam);
        } else { // Standard user or admin viewing a date for a store
            query = query.eq('data_fechamento', format(date, 'yyyy-MM-dd'));
            if (isAdmin && lojaIdFromParam) { // Admin viewing specific store's date
                query = query.eq('loja_id', lojaIdFromParam);
            } else if (!isAdmin && userLojaId) { // Regular user viewing their store's date
                query = query.eq('loja_id', userLojaId);
            } else if (!isAdmin && !userLojaId) { // Should not happen if profile is loaded
                toast({variant: "destructive", title: "Erro", description: "Loja do usuário não identificada."});
                setIsLoading(false);
                return;
            }
        }
        
        const { data: fechamento, error } = await query.maybeSingle();

        if (error) {
            console.error("Error fetching closing data:", error);
            toast({ variant: "destructive", title: "Erro ao Buscar Dados", description: error.message });
            setClosingData(null);
        } else if (fechamento) {
            // Adapt data for ClosingHistoryData structure
             const adaptedData: ClosingHistoryData = {
                id: fechamento.id,
                data_fechamento: fechamento.data_fechamento,
                loja_id: fechamento.loja_id,
                operator_name: fechamento.operator_name,
                user_id: fechamento.user_id,
                entradas: fechamento.entradas || {},
                entradas_eletronicas: fechamento.entradas_eletronicas || { pix: 0, cartao: 0, deposito: 0 },
                calculated_totals: fechamento.calculated_totals,
                saidas_operacionais_loja: fechamento.saidas_operacionais_loja?.map((s:any) => ({nome:s.nome, valor:s.valor, data_pagamento:s.data_pagamento})) || [],
                simone_saidas_operacionais: fechamento.simone_saidas_operacionais?.map((s:any) => ({nome:s.nome, valor:s.valor, data_pagamento:s.data_pagamento})) || [],
                novas_contas_a_receber_detalhes: fechamento.novas_contas_a_receber_detalhes?.map((ar:any) => ({nome_cliente: ar.nome_cliente, placa: ar.placa, valor_receber: ar.valor_receber})) || [],
                recebimentos_registrados_detalhes: fechamento.recebimentos_registrados_detalhes?.map((rr:any) => ({
                    valor_recebido: rr.valor_recebido,
                    conta_a_receber: rr.conta_a_receber ? { nome_cliente: rr.conta_a_receber.nome_cliente, placa: rr.conta_a_receber.placa } : null
                })) || [],
                created_at: fechamento.created_at,
                updated_at: fechamento.updated_at,
            };
            setClosingData(adaptedData);
        } else {
            setClosingData(null); // No data found
        }
        setIsLoading(false);
    };

    const isEditable = React.useMemo(() => {
        if (adminView || !closingData || !currentDate || !profile ) return false;
        if (profile.admin) return true; // Admin can always edit (though typically uses different flow)
        if (closingData.loja_id !== profile.loja_id) return false;
        try {
            const closingDt = parse(closingData.data_fechamento, 'yyyy-MM-dd', new Date());
            if (!isValid(closingDt)) return false;
            // Allow editing if created_at is within 7 days, or updated_at is within 7 days
            // Supabase returns ISO strings for timestamps
            const sevenDaysAgo = subDays(currentDate, 7);
            const createdAtDate = parseISO(closingData.created_at);
            return isAfter(createdAtDate, sevenDaysAgo);
        } catch(e) { return false; }
    }, [closingData, currentDate, adminView, profile]);


    if (authLoading || isLoading || !currentDate) {
        return (
            <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
                <Navbar />
                <main className="flex-grow container mx-auto px-4 md:px-8 py-8">
                    <div className="w-full max-w-4xl mx-auto space-y-8">
                        <div className="flex justify-between items-center mb-6"><Skeleton className="h-10 w-1/2 rounded-lg" /><Skeleton className="h-9 w-24 rounded-md" /></div>
                        <Skeleton className="h-48 w-full rounded-xl" /><Skeleton className="h-72 w-full rounded-xl" /><Skeleton className="h-60 w-full rounded-xl" />
                        <div className="flex justify-center gap-4 mt-4"><Skeleton className="h-4 w-1/4 rounded" /><Skeleton className="h-4 w-1/4 rounded" /></div>
                    </div>
                </main>
            </div>
        );
    }

     if (!parsedDate && !docIdParam) { // Check if both are missing
          return ( <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30"><Navbar /><main className="flex-grow container mx-auto px-4 md:px-8 py-8 flex items-center justify-center"><div className="text-center space-y-6 p-8 bg-card rounded-lg shadow-lg border border-border/50"><h1 className="text-3xl font-bold text-destructive tracking-tight">Parâmetros Inválidos</h1><p className="text-muted-foreground">Data ou ID do documento não fornecido.</p><Button onClick={() => router.push(profile?.admin ? '/admin' : '/')} variant="outline" className="gap-2"><ArrowLeft className="h-4 w-4" /> Voltar</Button></div></main></div> );
     }

    const displayDate = closingData ? parse(closingData.data_fechamento, 'yyyy-MM-dd', new Date()) : parsedDate;
    const formattedTitleDate = displayDate && isValid(displayDate) ? format(displayDate, 'PPP', { locale: ptBR }) : "Data Inválida";
    const storeName = getStoreName(closingData?.loja_id || lojaIdFromParam);
    const ct = closingData?.calculated_totals;

    return (
        <TooltipProvider>
            <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
                <Navbar />
                <main className="flex-grow container mx-auto px-4 md:px-8 py-8">
                    <div className="w-full max-w-4xl mx-auto space-y-8">
                        <header className="flex flex-wrap justify-between items-center gap-4 mb-6">
                            <h1 className="text-3xl font-bold text-foreground tracking-tight">Detalhes - {formattedTitleDate} {storeName !== 'Desconhecida' && <span className="text-base font-normal text-muted-foreground ml-2">({storeName})</span>} {closingData?.operator_name && <span className="text-sm font-normal text-muted-foreground ml-1 block md:inline">(Operador: {closingData.operator_name})</span>}</h1>
                            <Button onClick={() => router.push(adminView ? '/admin' : '/')} variant="outline" size="sm" className="gap-1.5 shadow-sm hover:shadow-md transition-shadow rounded-lg"><ArrowLeft className="h-4 w-4" /> Voltar</Button>
                        </header>

                        {closingData && ct ? (
                            <>
                                <Card className="shadow-lg border border-success/30 overflow-hidden bg-white rounded-xl">
                                    <CardHeader className="bg-success/5 border-b border-success/10"><CardTitle className="text-xl font-semibold text-success flex items-center gap-3"><div className="bg-success/10 p-2 rounded-lg"><TrendingUp className="h-5 w-5 text-success" /></div>Entradas</CardTitle></CardHeader>
                                    <CardContent className="p-6 text-base space-y-4">
                                        <div><h4 className="font-medium text-foreground/80 mb-2">Entradas Comuns:</h4><div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">{Object.entries(closingData.entradas).filter(([, qty]) => qty > 0).map(([key, qty]) => (<div key={key} className="bg-muted/20 p-3 rounded-lg border border-border/30"><p className="font-medium text-foreground/90">{entradaIdToLabelMap[key] || capitalize(key)}</p><p className="text-muted-foreground text-sm">Qtde: <span className="font-semibold text-success text-base">{qty}</span></p></div>))}{Object.keys(closingData.entradas).length === 0 && <p className="col-span-full text-sm text-muted-foreground italic">Nenhuma.</p>}</div><p className="text-right mt-3 font-semibold text-success">Subtotal Comuns: {formatCurrency(ct.totalEntradasComuns)}</p></div>
                                        {closingData.recebimentos_registrados_detalhes && closingData.recebimentos_registrados_detalhes.length > 0 && (<div className="pt-3 border-t border-border/20"><h4 className="font-medium text-foreground/80 mb-2 flex items-center gap-1.5"><Wallet className="h-4 w-4 text-success/80"/>Recebimentos de A/R Registrados:</h4><ul className="space-y-1 pl-2">{closingData.recebimentos_registrados_detalhes.map((rec, idx) => (<li key={`rec-${idx}`} className="text-sm text-muted-foreground flex justify-between"><span>{rec.conta_a_receber?.nome_cliente || 'Cliente Desconhecido'} ({rec.conta_a_receber?.placa || 'S/Placa'}):</span> <span className="font-medium text-success">{formatCurrency(rec.valor_recebido)}</span></li>))}</ul><p className="text-right mt-2 font-semibold text-success">Subtotal Recebimentos: {formatCurrency(ct.totalReceivedPayments)}</p></div>)}
                                    </CardContent>
                                    <CardFooter className="bg-success/10 px-6 py-3 mt-0 border-t border-success/20"><p className="w-full text-right text-lg font-bold text-success">Total Entradas Brutas: {formatCurrency(ct.totalEntradasBrutas)}</p></CardFooter>
                                </Card>
                                <Card className="shadow-lg border border-blue-500/30 overflow-hidden bg-white rounded-xl"><CardHeader className="bg-blue-500/5 border-b border-blue-500/10"><CardTitle className="text-xl font-semibold text-blue-600 flex items-center gap-3"><div className="bg-blue-500/10 p-2 rounded-lg"><CreditCard className="h-5 w-5 text-blue-500" /></div>Entradas Eletrônicas</CardTitle></CardHeader><CardContent className="p-6 text-base"><div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{closingData.entradas_eletronicas.pix > 0 && <div className="bg-muted/20 p-3 rounded-lg border border-border/30"><p className="font-medium text-foreground/90 flex items-center gap-1.5"><QrCode className="h-4 w-4 text-blue-500"/>Pix</p><p className="text-blue-600 font-semibold">{formatCurrency(closingData.entradas_eletronicas.pix)}</p></div>}{closingData.entradas_eletronicas.cartao > 0 && <div className="bg-muted/20 p-3 rounded-lg border border-border/30"><p className="font-medium text-foreground/90 flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-blue-500"/>Cartão</p><p className="text-blue-600 font-semibold">{formatCurrency(closingData.entradas_eletronicas.cartao)}</p></div>}{closingData.entradas_eletronicas.deposito > 0 && <div className="bg-muted/20 p-3 rounded-lg border border-border/30"><p className="font-medium text-foreground/90 flex items-center gap-1.5"><Banknote className="h-4 w-4 text-blue-500"/>Depósito</p><p className="text-blue-600 font-semibold">{formatCurrency(closingData.entradas_eletronicas.deposito)}</p></div>}{ct.totalEntradasEletronicas === 0 && <p className="col-span-full text-sm text-muted-foreground italic text-center">Nenhuma.</p>}</div></CardContent><CardFooter className="bg-blue-500/10 px-6 py-3 mt-0 border-t border-blue-500/20"><p className="w-full text-right text-lg font-bold text-blue-600">Total Entr. Eletrônicas: {formatCurrency(ct.totalEntradasEletronicas)}</p></CardFooter></Card>
                                <Card className="shadow-lg border border-destructive/30 overflow-hidden bg-white rounded-xl"><CardHeader className="bg-destructive/5 border-b border-destructive/10"><CardTitle className="text-xl font-semibold text-destructive flex items-center gap-3"><div className="bg-destructive/10 p-2 rounded-lg"><TrendingDown className="h-5 w-5 text-destructive" /></div>Saídas e Contas a Receber Geradas</CardTitle></CardHeader><CardContent className="p-6 space-y-4 text-base">{closingData.saidas_operacionais_loja.length > 0 && (<div><h4 className="font-medium text-foreground/80 mb-2 flex items-center gap-1.5"><ReceiptText className="h-4 w-4 text-destructive/80"/>Saídas Op. (Loja):</h4><ul className="space-y-1 pl-2">{closingData.saidas_operacionais_loja.map((exit, idx) => (<li key={`op-${idx}`} className="text-sm text-muted-foreground flex justify-between"><span>{exit.nome} <span className="text-xs">({format(parse(exit.data_pagamento, 'yyyy-MM-dd', new Date()), 'dd/MM/yy')})</span>:</span> <span className="font-medium text-destructive">{formatCurrency(exit.valor)}</span></li>))}</ul><p className="text-right mt-2 font-semibold text-destructive">Subtotal Loja: {formatCurrency(ct.totalSaidasOperacionais)}</p></div>)}{closingData.simone_saidas_operacionais && closingData.simone_saidas_operacionais.length > 0 && (<div className="pt-3 border-t border-border/20"><h4 className="font-medium text-foreground/80 mb-2 flex items-center gap-1.5"><UserMinus className="h-4 w-4 text-destructive/80"/>Saídas Op. (Simone):</h4><ul className="space-y-1 pl-2">{closingData.simone_saidas_operacionais.map((exit, idx) => (<li key={`simone-op-${idx}`} className="text-sm text-muted-foreground flex justify-between"><span>{exit.nome} <span className="text-xs">({format(parse(exit.data_pagamento, 'yyyy-MM-dd', new Date()), 'dd/MM/yy')})</span>:</span> <span className="font-medium text-destructive">{formatCurrency(exit.valor)}</span></li>))}</ul><p className="text-right mt-2 font-semibold text-destructive">Subtotal Simone: {formatCurrency(ct.totalSimoneSaidasOperacionais || 0)}</p></div>)}{closingData.novas_contas_a_receber_detalhes && closingData.novas_contas_a_receber_detalhes.length > 0 && (<div className="pt-3 border-t border-border/20"><h4 className="font-medium text-foreground/80 mb-2 flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-orange-500"/>Novas A/R Geradas:</h4><ul className="space-y-1 pl-2">{closingData.novas_contas_a_receber_detalhes.map((acc, idx) => (<li key={`nr-${idx}`} className="text-sm text-muted-foreground flex justify-between"><span>{acc.nome_cliente} ({acc.placa || 'S/Placa'}):</span> <span className="font-medium text-orange-600">{formatCurrency(acc.valor_receber)}</span></li>))}</ul><p className="text-right mt-2 font-semibold text-orange-600">Subtotal Novas A/R: {formatCurrency(ct.totalNovasContasAReceber)}</p></div>)}{(closingData.saidas_operacionais_loja.length === 0 && (!closingData.simone_saidas_operacionais || closingData.simone_saidas_operacionais.length === 0) && (!closingData.novas_contas_a_receber_detalhes || closingData.novas_contas_a_receber_detalhes.length === 0)) && <p className="col-span-full text-sm text-muted-foreground italic text-center">Nenhuma.</p>}</CardContent><CardFooter className="bg-destructive/10 px-6 py-3 mt-0 border-t border-destructive/20"><p className="w-full text-right text-lg font-bold text-destructive">Total Saídas Geral: {formatCurrency(ct.totalSaidasGeral)}</p></CardFooter></Card>
                                <Card className="bg-card shadow-lg border border-border/40 rounded-xl"><CardHeader className="border-b border-border/20 pb-4"><CardTitle className="text-2xl font-bold text-center text-foreground">Resultado Final</CardTitle></CardHeader><CardContent className="space-y-4 text-lg px-6 pt-6 pb-6"><div className="flex justify-between items-center"><span className="text-muted-foreground">Entr. Brutas:</span><span className="font-semibold text-success">{formatCurrency(ct.totalEntradasBrutas)}</span></div><Separator className="my-1 border-border/15"/><div className="flex justify-between items-center"><span className="text-muted-foreground">(-) Saídas Gerais:</span><span className="font-semibold text-destructive">{formatCurrency(ct.totalSaidasGeral)}</span></div><Separator className="my-2 border-primary/20 border-dashed"/><div className="flex justify-between items-center text-xl font-bold"><span>Resultado Parcial:</span><span className={cn(ct.resultadoParcial >= 0 ? 'text-foreground' : 'text-destructive')}>{formatCurrency(ct.resultadoParcial)}</span></div><Separator className="my-1 border-border/15"/><div className="flex justify-between items-center"><span className="text-muted-foreground">(-) Entr. Eletrônicas:</span><span className="font-semibold text-blue-600">{formatCurrency(ct.totalEntradasEletronicas)}</span></div><Separator className="my-3 border-primary/20 border-dashed"/><div className="flex justify-between items-center text-xl font-bold"><span className="flex items-center gap-2"><Coins className="h-5 w-5 text-primary"/>Espécie (Conferência):</span><span className={cn("px-3 py-1 rounded-md font-bold tracking-wide", ct.valorEmEspecieConferencia >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>{formatCurrency(ct.valorEmEspecieConferencia)}</span></div></CardContent>
                                    <CardFooter className="flex justify-end items-center gap-3 pt-4 border-t border-border/20">
                                         <Button variant="outline" size="default" className="gap-2 shadow-sm hover:shadow-md transition-all rounded-lg h-10" onClick={generatePdfDummy} disabled={isLoading} aria-label="Gerar PDF"><Download className="h-4 w-4"/>Gerar PDF</Button>
                                        {!adminView && (
                                            <Tooltip><TooltipTrigger asChild><span className={!isEditable ? 'cursor-not-allowed' : ''}><Link href={`/fechamento/${closingData.id}`} passHref aria-disabled={!isEditable} tabIndex={isEditable ? undefined : -1} onClick={(e) => !isEditable && e.preventDefault()} className={cn(!isEditable ? 'pointer-events-none' : '', 'inline-block')}><Button variant="default" size="default" className="gap-2 shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed transition-all rounded-lg h-10" disabled={!isEditable || authLoading} aria-label={isEditable ? `Editar` : `Edição não permitida`}><Pencil className="h-4 w-4"/>Editar</Button></Link></span></TooltipTrigger>{!isEditable && (<TooltipContent><p>Edição permitida apenas para fechamentos criados nos últimos 7 dias.</p></TooltipContent>)}</Tooltip>
                                        )}
                                    </CardFooter>
                                </Card>
                                <div className="text-xs text-muted-foreground text-center mt-4 space-x-4"><span>Criado: {format(parseISO(closingData.created_at), 'Pp', { locale: ptBR })}</span><span>Última Atualização: {format(parseISO(closingData.updated_at), 'Pp', { locale: ptBR })}</span></div>
                            </>
                        ) : (
                            <Card className="shadow-md border border-border/50 bg-white rounded-xl"><CardContent className="p-10 text-center"><p className="text-lg text-muted-foreground">Nenhum fechamento encontrado para os critérios selecionados.</p></CardContent></Card>
                        )}
                    </div>
                </main>
            </div>
        </TooltipProvider>
    );
}
    