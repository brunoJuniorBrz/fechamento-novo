'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
    Trash2, Save, ArrowLeft, PlusCircle, Car, Truck, Bike, FileSearch, ClipboardPen, Building,
    CreditCard, QrCode, Banknote, TrendingUp, TrendingDown, User as UserIconLc,
    Download, MessageSquare, type LucideIcon, Coins, ReceiptText, UserMinus
} from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { format, parse, isValid, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Navbar from '@/components/navbar';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  loja_id: string | null;
  nome_operador?: string | null;
  admin?: boolean | null;
}

interface EntranceConfig {
  id: string; name: string; price: number; icon: LucideIcon;
}
interface Entrance extends EntranceConfig { quantity: string; }
interface ElectronicEntryInput { pix: string; cartao: string; deposito: string; }
interface OperationalExit { id: number; name: string; amount: number; amountInput: string; paymentDateInput: string; }
interface CalculatedTotals {
    totalEntradasComuns: number; totalReceivedPayments: number; totalEntradasBrutas: number;
    totalEntradasEletronicas: number; totalSaidasOperacionais: number; totalSimoneSaidasOperacionais?: number;
    totalNovasContasAReceber: number; totalSaidasGeral: number; resultadoParcial: number; valorEmEspecieConferencia: number;
}
// Representa os dados de um fechamento existente buscado do Supabase
interface FetchedClosingData {
    id: string;
    data_fechamento: string; // YYYY-MM-DD
    operator_name?: string | null;
    user_id: string;
    loja_id: string;
    entradas: Record<string, number>; // JSONB from Supabase
    entradas_eletronicas: { pix: number; cartao: number; deposito: number; }; // JSONB
    calculated_totals: CalculatedTotals; // JSONB
    saidas_operacionais_loja: { nome: string; valor: number; data_pagamento: string; }[]; // From related table
    simone_saidas_operacionais?: { nome: string; valor: number; data_pagamento: string; }[]; // From related table
    // Recebimentos e Novas A/R são fixos após o fechamento, não editáveis aqui.
    // Os valores já estarão em calculated_totals.totalReceivedPayments e calculated_totals.totalNovasContasAReceber
    updated_at: string;
}


const initialEntrancesConfigData: EntranceConfig[] = [
    { id: 'carro', name: 'Carro', price: 120, icon: Car },
    { id: 'caminhonete', name: 'Caminhonete', price: 140, icon: Truck },
    { id: 'caminhao', name: 'Caminhão', price: 180, icon: Truck },
    { id: 'moto', name: 'Moto', price: 100, icon: Bike },
    { id: 'cautelar', name: 'Cautelar', price: 220, icon: ClipboardPen },
    { id: 'revistoriaDetran', name: 'Revistoria DETRAN', price: 200, icon: Building },
    { id: 'pesquisaProcedencia', name: 'Pesquisa de Procedência', price: 60, icon: FileSearch },
];

const parseInput = (value: string | number | undefined | null): number => {
    if (typeof value === 'number') return isNaN(value) || !isFinite(value) ? 0 : value;
    if (value === '' || value === null || value === undefined) return 0;
    const cleanedValue = String(value).replace(/[^\d,.]/g, '').replace('.', '').replace(',', '.');
    const parts = cleanedValue.split('.');
    let finalValueString = cleanedValue;
    if (parts.length > 2) finalValueString = parts[0] + '.' + parts.slice(1).join('');
    const parsed = parseFloat(finalValueString);
    return isNaN(parsed) ? 0 : parsed;
};
const formatCurrency = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value) || !isFinite(value)) return 'R$ 0,00';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};
const formatInputValue = (value: string | number | undefined | null): string => {
     if (value === undefined || value === null) return '';
     if (typeof value === 'number') {
        return value.toFixed(2).replace('.', ',');
     }
     let sValue = String(value).replace(/[^0-9,]/g, '');
     const commaIndex = sValue.indexOf(',');
     if (commaIndex !== -1) {
         sValue = sValue.substring(0, commaIndex + 1) + sValue.substring(commaIndex + 1).replace(/,/g, '');
         if (sValue.substring(commaIndex + 1).length > 2) {
            sValue = sValue.substring(0, commaIndex + 3);
         }
     }
     return sValue;
};
const handleDateInputChangeHelper = (value: string): string => {
    let v = value.replace(/\D/g, '');
    if (v.length > 8) v = v.slice(0, 8);
    let formattedValue = '';
    if (v.length > 4) formattedValue = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
    else if (v.length > 2) formattedValue = `${v.slice(0, 2)}/${v.slice(2)}`;
    else formattedValue = v;
    return formattedValue;
};
const parseInputDateForStorage = (dateString: string): string | null => {
    if (!dateString || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return null;
    try {
        const parsedDate = startOfDay(parse(dateString, 'dd/MM/yyyy', new Date()));
        return isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : null;
    } catch (e) { return null; }
};

const generatePdfDummy = () => {
    console.log("generatePdf called (dummy - implement with new PDF library if needed)");
    alert("Funcionalidade de PDF a ser reimplementada.");
};

export default function EditCashierClosingPage() {
    const router = useRouter();
    const params = useParams();
    const docId = params.id as string;
    const { toast } = useToast();
    const supabase = createClient();

    const [user, setUser] = React.useState<User | null>(null);
    const [profile, setProfile] = React.useState<Profile | null>(null);
    const [authLoading, setAuthLoading] = React.useState(true);
    
    const [isLoadingPage, setIsLoadingPage] = React.useState(true);
    const [isSaving, setIsSaving] = React.useState(false);
    const [entrances, setEntrances] = React.useState<Entrance[]>([]);
    const [electronicEntries, setElectronicEntries] = React.useState<ElectronicEntryInput>({ pix: '', cartao: '', deposito: '' });
    const [operationalExits, setOperationalExits] = React.useState<OperationalExit[]>([]);
    const [simoneOperationalExits, setSimoneOperationalExits] = React.useState<OperationalExit[]>([]);
    const [newOperationalExitName, setNewOperationalExitName] = React.useState('');
    const [newOperationalExitAmount, setNewOperationalExitAmount] = React.useState('');
    const [newOperationalExitPaymentDate, setNewOperationalExitPaymentDate] = React.useState<string>(format(new Date(), 'dd/MM/yyyy'));
    const [newSimoneOperationalExitName, setNewSimoneOperationalExitName] = React.useState('');
    const [newSimoneOperationalExitAmount, setNewSimoneOperationalExitAmount] = React.useState('');
    const [newSimoneOperationalExitPaymentDate, setNewSimoneOperationalExitPaymentDate] = React.useState<string>(format(new Date(), 'dd/MM/yyyy'));
    
    const [closingDate, setClosingDate] = React.useState<Date | null>(null); // This is the displayed date, not editable here
    const [originalClosingDateString, setOriginalClosingDateString] = React.useState<string>(''); // YYYY-MM-DD
    const [operatorName, setOperatorName] = React.useState<string>('');
    const [fetchedClosingData, setFetchedClosingData] = React.useState<FetchedClosingData | null>(null);
    const [isSimoneUser, setIsSimoneUser] = React.useState(false);
    const [isOperatorNameRequired, setIsOperatorNameRequired] = React.useState(false);


    React.useEffect(() => {
        console.log('[DEBUG EditFechamento] useEffect iniciado');
        // Checagem inicial da sessão
        const checkInitialSession = async () => {
            setAuthLoading(true);
            console.log('[DEBUG EditFechamento] Iniciando checkInitialSession');
            const { data: { session } } = await supabase.auth.getSession();
            console.log('[DEBUG EditFechamento] getSession retornou:', session);
            const currentUser = session?.user ?? null;
            setUser(currentUser);
            if (currentUser) {
                console.log('[DEBUG EditFechamento] Usuário autenticado:', currentUser.id);
                const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('id, loja_id, nome_operador, admin')
                    .eq('id', currentUser.id)
                    .maybeSingle();
                console.log('[DEBUG EditFechamento] Resultado do fetch de perfil:', { profileData, profileError });
                if (profileError) {
                    console.error('[DEBUG EditFechamento] Erro ao buscar perfil:', profileError.message);
                    setProfile(null);
                    toast({ variant: "destructive", title: "Erro de Perfil", description: "Não foi possível carregar dados do perfil."});
                    router.push('/login');
                    setAuthLoading(false);
                    return;
                } else {
                    setProfile(profileData);
                    if (profileData) {
                        setIsSimoneUser(profileData.loja_id === 'admin' || profileData.admin === true);
                        setIsOperatorNameRequired(profileData.loja_id === 'capao' || profileData.loja_id === 'admin' || profileData.admin === true);
                        if(docId) {
                          console.log('[DEBUG EditFechamento] Buscando dados do fechamento:', docId, profileData.loja_id, profileData.admin);
                          fetchClosingDataFromSupabase(docId, profileData.loja_id, profileData.admin);
                        }
                    } else {
                        toast({ variant: "destructive", title: "Perfil não encontrado", description: "Contate o administrador." });
                        router.push('/');
                        setAuthLoading(false);
                        return;
                    }
                }
            } else {
                setProfile(null);
                console.warn('[DEBUG EditFechamento] Nenhum usuário autenticado, redirecionando para /login');
                router.push('/login');
                setAuthLoading(false);
                return;
            }
            setAuthLoading(false);
            console.log('[DEBUG EditFechamento] checkInitialSession finalizado');
        };
        checkInitialSession();
        // Listener para mudanças futuras de autenticação
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
            setAuthLoading(true);
            console.log('[DEBUG EditFechamento] onAuthStateChange disparado:', event, session);
            const currentUser = session?.user ?? null;
            setUser(currentUser);
            if (currentUser) {
                const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('id, loja_id, nome_operador, admin')
                    .eq('id', currentUser.id)
                    .maybeSingle();
                console.log('[DEBUG EditFechamento] onAuthStateChange perfil:', { profileData, profileError });
                if (profileError) {
                    setProfile(null);
                    router.push('/login');
                    setAuthLoading(false);
                    return;
                } else {
                    setProfile(profileData);
                    if (profileData) {
                        setIsSimoneUser(profileData.loja_id === 'admin' || profileData.admin === true);
                        setIsOperatorNameRequired(profileData.loja_id === 'capao' || profileData.loja_id === 'admin' || profileData.admin === true);
                        if(docId) {
                          fetchClosingDataFromSupabase(docId, profileData.loja_id, profileData.admin);
                        }
                    } else {
                        toast({ variant: "destructive", title: "Perfil não encontrado", description: "Contate o administrador." });
                        router.push('/');
                        setAuthLoading(false);
                        return;
                    }
                }
            } else {
                setProfile(null);
                router.push('/login');
                setAuthLoading(false);
                return;
            }
            setAuthLoading(false);
        });
        return () => { authListener.subscription.unsubscribe(); console.log('[DEBUG EditFechamento] Listener de auth removido'); };
    }, [supabase, router, toast, docId]);


    const fetchClosingDataFromSupabase = async (documentId: string, userLojaId?: string | null, isAdmin?: boolean | null) => {
        setIsLoadingPage(true);
        const { data: fechamento, error: fechamentoError } = await supabase
            .from('fechamentos')
            .select(`
                *,
                saidas_loja:fechamento_saidas_operacionais(*),
                saidas_simone:fechamento_simone_saidas_operacionais(*)
            `)
            .eq('id', documentId)
            .maybeSingle();

        if (fechamentoError) {
            toast({ variant: "destructive", title: "Erro ao Carregar Fechamento", description: fechamentoError.message });
            router.push(isAdmin ? '/admin' : '/');
            setIsLoadingPage(false);
            return;
        }
        if (!fechamento) {
            toast({ variant: "destructive", title: "Fechamento Não Encontrado", description: "O registro solicitado não foi encontrado." });
            router.push(isAdmin ? '/admin' : '/');
            setIsLoadingPage(false);
            return;
        }
        if (!isAdmin && fechamento.loja_id !== userLojaId) {
             toast({variant: "destructive", title: "Acesso Negado", description: "Você não tem permissão para editar este fechamento."});
             router.push('/');
             setIsLoadingPage(false);
             return;
        }
        
        // Adapt Supabase data to FetchedClosingData structure
        const adaptedData: FetchedClosingData = {
            id: fechamento.id,
            data_fechamento: fechamento.data_fechamento,
            operator_name: fechamento.operator_name,
            user_id: fechamento.user_id,
            loja_id: fechamento.loja_id,
            entradas: fechamento.entradas as Record<string, number> || {},
            entradas_eletronicas: fechamento.entradas_eletronicas as { pix: number; cartao: number; deposito: number; } || {pix:0, cartao:0, deposito:0},
            calculated_totals: fechamento.calculated_totals as CalculatedTotals, // Assume this is correctly stored
            saidas_operacionais_loja: fechamento.saidas_loja.map((s: any) => ({ nome: s.nome, valor: s.valor, data_pagamento: s.data_pagamento })),
            simone_saidas_operacionais: fechamento.saidas_simone?.map((s: any) => ({ nome: s.nome, valor: s.valor, data_pagamento: s.data_pagamento })),
            updated_at: fechamento.updated_at,
        };

        setFetchedClosingData(adaptedData);
        setOriginalClosingDateString(adaptedData.data_fechamento); // YYYY-MM-DD
        try {
            const dateObject = parse(adaptedData.data_fechamento, 'yyyy-MM-dd', new Date());
            if (isValid(dateObject)) setClosingDate(dateObject); else setClosingDate(null);
        } catch (e) { setClosingDate(null); }
        
        setOperatorName(adaptedData.operator_name || profile?.nome_operador || '');
        setEntrances(initialEntrancesConfigData.map(init => ({ ...init, quantity: (adaptedData.entradas?.[init.id] ?? 0).toString() })));
        setElectronicEntries({ 
            pix: formatInputValue(adaptedData.entradas_eletronicas?.pix ?? 0), 
            cartao: formatInputValue(adaptedData.entradas_eletronicas?.cartao ?? 0), 
            deposito: formatInputValue(adaptedData.entradas_eletronicas?.deposito ?? 0), 
        });
        setOperationalExits((adaptedData.saidas_operacionais_loja ?? []).map((exit, idx) => ({ 
            id: Date.now() + idx, 
            name: exit.nome, 
            amount: exit.valor, 
            amountInput: formatInputValue(exit.valor), 
            paymentDateInput: exit.data_pagamento ? format(parse(exit.data_pagamento, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : '' 
        })));
        if (isSimoneUser) {
            setSimoneOperationalExits((adaptedData.simone_saidas_operacionais ?? []).map((exit, idx) => ({ 
                id: Date.now() + idx + 1000, // ensure unique temp id
                name: exit.nome, 
                amount: exit.valor, 
                amountInput: formatInputValue(exit.valor), 
                paymentDateInput: exit.data_pagamento ? format(parse(exit.data_pagamento, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : '' 
            })));
        }

        setIsLoadingPage(false);
    };

    const handleEntranceChange = (index: number, value: string) => {
        const sanitizedValue = value.replace(/[^0-9]/g, '');
        setEntrances(prev => { const ns = [...prev]; ns[index] = { ...ns[index], quantity: sanitizedValue }; return ns; });
    };
    const handleElectronicEntryChange = (type: keyof ElectronicEntryInput, value: string) => {
        setElectronicEntries(prev => ({ ...prev, [type]: formatInputValue(value) }));
    };
    const handleNewOperationalExitAmountChange = (value: string, isSimoneExit: boolean = false) => {
        if (isSimoneExit) setNewSimoneOperationalExitAmount(formatInputValue(value));
        else setNewOperationalExitAmount(formatInputValue(value));
    };
    const handleNewOperationalExitPaymentDateChange = (value: string, isSimoneExit: boolean = false) => {
        const formatted = handleDateInputChangeHelper(value);
        if (isSimoneExit) setNewSimoneOperationalExitPaymentDate(formatted);
        else setNewOperationalExitPaymentDate(formatted);
    };
    const handleAddOperationalExit = (isSimoneExitFlag: boolean = false) => {
        const name = isSimoneExitFlag ? newSimoneOperationalExitName.trim() : newOperationalExitName.trim();
        const amountStr = isSimoneExitFlag ? newSimoneOperationalExitAmount : newOperationalExitAmount;
        const paymentDateInputStr = isSimoneExitFlag ? newSimoneOperationalExitPaymentDate : newOperationalExitPaymentDate;
        const amount = parseInput(amountStr);
        const paymentDateParsed = parseInputDateForStorage(paymentDateInputStr);
        if (!name || amount <= 0 || !paymentDateParsed) {
            toast({ variant: "destructive", title: "Dados Inválidos", description: "Preencha nome, valor (maior que zero) e data de pagamento válida.", duration: 3000 }); return;
        }
        const newExit = { id: Date.now(), name, amount, amountInput: amountStr, paymentDateInput: paymentDateInputStr };
        if (isSimoneExitFlag) {
            setSimoneOperationalExits(prev => [...prev, newExit]);
            setNewSimoneOperationalExitName(''); setNewSimoneOperationalExitAmount(''); setNewSimoneOperationalExitPaymentDate(format(new Date(), 'dd/MM/yyyy'));
        } else {
            setOperationalExits(prev => [...prev, newExit]);
            setNewOperationalExitName(''); setNewOperationalExitAmount(''); setNewOperationalExitPaymentDate(format(new Date(), 'dd/MM/yyyy'));
        }
    };
    const handleRemoveOperationalExit = (id: number, isSimoneExitFlag: boolean = false) => {
        if (isSimoneExitFlag) setSimoneOperationalExits(prev => prev.filter(e => e.id !== id));
        else setOperationalExits(prev => prev.filter(e => e.id !== id));
    };

    const totalEntradasComuns = React.useMemo(() => entrances.reduce((sum, en) => sum + en.price * parseInput(en.quantity), 0), [entrances]);
    // totalReceivedPayments e totalNovasContasAReceber não são editáveis aqui, vêm do fetchedClosingData.calculatedTotals
    const totalReceivedPayments = fetchedClosingData?.calculated_totals.totalReceivedPayments || 0;
    const totalNovasContasAReceber = fetchedClosingData?.calculated_totals.totalNovasContasAReceber || 0;
    const totalEntradasBrutas = totalEntradasComuns + totalReceivedPayments;
    const totalEntradasEletronicas = React.useMemo(() => parseInput(electronicEntries.pix) + parseInput(electronicEntries.cartao) + parseInput(electronicEntries.deposito), [electronicEntries]);
    const totalSaidasOperacionais = React.useMemo(() => operationalExits.reduce((sum, ex) => sum + ex.amount, 0), [operationalExits]);
    const totalSimoneSaidasOperacionaisValue = React.useMemo(() => simoneOperationalExits.reduce((sum, ex) => sum + ex.amount, 0), [simoneOperationalExits]);
    const totalSaidasGeral = totalSaidasOperacionais + (isSimoneUser ? totalSimoneSaidasOperacionaisValue : 0) + totalNovasContasAReceber;
    const resultadoParcial = totalEntradasBrutas - totalSaidasGeral;
    const valorEmEspecieConferencia = resultadoParcial - totalEntradasEletronicas;

    const handleUpdateCashier = async () => {
        if (!fetchedClosingData || !user || !profile) {
            toast({ variant: "destructive", title: "Erro", description: "Dados do fechamento ou usuário não carregados.", duration: 3000 }); return;
        }
        if (isOperatorNameRequired && !operatorName.trim()) {
             toast({ variant: "destructive", title: "Nome do Operador Necessário", description: "Insira o nome.", duration: 3000 }); return;
        }
        setIsSaving(true);

        const calculatedTotalsObj: CalculatedTotals = {
            totalEntradasComuns, totalReceivedPayments, totalEntradasBrutas,
            totalEntradasEletronicas, totalSaidasOperacionais,
            totalSimoneSaidasOperacionais: isSimoneUser ? totalSimoneSaidasOperacionaisValue : undefined,
            totalNovasContasAReceber, totalSaidasGeral, resultadoParcial, valorEmEspecieConferencia
        };

        const updatedFechamentoData = {
            operator_name: operatorName.trim() || null,
            entradas: Object.fromEntries(entrances.map(e => [e.id, parseInput(e.quantity)]).filter(([,qty]) => typeof qty === 'number' && qty > 0)),
            entradas_eletronicas: { pix: parseInput(electronicEntries.pix), cartao: parseInput(electronicEntries.cartao), deposito: parseInput(electronicEntries.deposito) },
            calculated_totals: calculatedTotalsObj,
            updated_at: new Date().toISOString() // Update timestamp
        };

        // 1. Atualizar o registro principal em 'fechamentos'
        const { error: updateFechamentoError } = await supabase
            .from('fechamentos')
            .update(updatedFechamentoData)
            .eq('id', docId);

        if (updateFechamentoError) {
            toast({ variant: "destructive", title: "Erro ao Atualizar Fechamento", description: updateFechamentoError.message });
            setIsSaving(false); return;
        }

        let hasSubErrors = false;

        // 2. Sincronizar saídas operacionais da loja
        //    (Delete all existing for this fechamento_id, then insert current state)
        const { error: deleteSaidasLojaError } = await supabase
            .from('fechamento_saidas_operacionais')
            .delete()
            .eq('fechamento_id', docId);
        if (deleteSaidasLojaError) {
            toast({ variant: "destructive", title: "Erro ao Limpar Saídas Antigas (Loja)", description: deleteSaidasLojaError.message });
            hasSubErrors = true;
        } else if (operationalExits.length > 0) {
            const saidasLojaToInsert = operationalExits.map(e => ({
                fechamento_id: docId,
                nome: e.name,
                valor: e.amount,
                data_pagamento: parseInputDateForStorage(e.paymentDateInput) as string
            }));
            const { error: insertSaidasLojaError } = await supabase.from('fechamento_saidas_operacionais').insert(saidasLojaToInsert);
            if (insertSaidasLojaError) {
                toast({ variant: "destructive", title: "Erro ao Salvar Novas Saídas (Loja)", description: insertSaidasLojaError.message });
                hasSubErrors = true;
            }
        }
        
        // 3. Sincronizar saídas operacionais da Simone (se aplicável)
        if (isSimoneUser) {
            const { error: deleteSaidasSimoneError } = await supabase
                .from('fechamento_simone_saidas_operacionais')
                .delete()
                .eq('fechamento_id', docId);
            if (deleteSaidasSimoneError) {
                toast({ variant: "destructive", title: "Erro ao Limpar Saídas Antigas (Simone)", description: deleteSaidasSimoneError.message });
                hasSubErrors = true;
            } else if (simoneOperationalExits.length > 0) {
                const saidasSimoneToInsert = simoneOperationalExits.map(e => ({
                    fechamento_id: docId,
                    nome: e.name,
                    valor: e.amount,
                    data_pagamento: parseInputDateForStorage(e.paymentDateInput) as string
                }));
                const { error: insertSaidasSimoneError } = await supabase.from('fechamento_simone_saidas_operacionais').insert(saidasSimoneToInsert);
                if (insertSaidasSimoneError) {
                    toast({ variant: "destructive", title: "Erro ao Salvar Novas Saídas (Simone)", description: insertSaidasSimoneError.message });
                    hasSubErrors = true;
                }
            }
        }

        setIsSaving(false);
        if (hasSubErrors) {
            toast({ title: "Atualização Parcialmente Concluída", description: "Alguns dados podem não ter sido atualizados. Verifique.", duration: 5000 });
        } else {
            toast({ title: "Sucesso!", description: "Fechamento atualizado com sucesso.", duration: 3000 });
        }
        router.push(profile?.admin ? `/admin` : `/historico/${originalClosingDateString}`); // Redirect to history of that date or admin
        router.refresh();
    };

    const handleSendPdfToWhatsApp = () => {
        if (!fetchedClosingData || !closingDate) {
            toast({ variant: "destructive", title: "Erro", description: "Dados não carregados.", duration: 3000 }); return;
        }
        generatePdfDummy(); // Placeholder
    };

    if (authLoading || isLoadingPage) {
        return (
             <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
                 <Navbar />
                 <main className="flex-grow container mx-auto px-4 md:px-8 py-8 w-full">
                     <div className="w-full max-w-5xl space-y-8 mx-auto">
                         <div className="flex justify-between items-center mb-8"><Skeleton className="h-10 w-2/5 rounded-lg" /><Skeleton className="h-11 w-40 rounded-md" /></div>
                         { (isOperatorNameRequired || isSimoneUser) && <Skeleton className="h-24 w-full rounded-xl" />}
                         <Skeleton className="h-80 w-full rounded-xl" />
                         <Skeleton className="h-80 w-full rounded-xl" />
                         <Skeleton className="h-[500px] w-full rounded-xl" />
                         <Skeleton className="h-60 w-full rounded-xl" />
                         <footer className="flex justify-end items-center mt-10 pb-4 gap-4"> <Skeleton className="h-11 w-48 rounded-md" /> <Skeleton className="h-11 w-56 rounded-md" /> </footer>
                     </div>
                </main>
             </div>);
    }
    if (!fetchedClosingData) {
         return (
            <div className="flex flex-col min-h-screen">
                <Navbar />
                <main className="flex-grow container mx-auto p-8 text-center">
                    <p>Fechamento não encontrado ou erro ao carregar.</p>
                    <Button onClick={() => router.push(profile?.admin ? '/admin' : '/')} className="mt-4">Voltar</Button>
                </main>
            </div>
        );
    }

    let formattedTitleDate = 'Data Inválida';
    if (closingDate && isValid(closingDate)) {
       try { formattedTitleDate = format(closingDate, 'PPP', { locale: ptBR }); } catch (e) { formattedTitleDate = originalClosingDateString; }
    } else if (originalClosingDateString) { formattedTitleDate = `Data Original: ${originalClosingDateString}`; }

    return (
        <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
             <Navbar />
             <main className="flex-grow container mx-auto px-4 md:px-8 py-8 w-full">
                 <div className="w-full max-w-5xl space-y-8 mx-auto">
                    <header className="flex flex-wrap justify-between items-center mb-8 gap-4">
                        <h1 className="text-3xl font-bold text-foreground tracking-tight"> Editar Fechamento - {formattedTitleDate} </h1>
                        <Button variant="outline" onClick={() => router.back()} disabled={isSaving} className="gap-2 h-11 shadow-sm hover:shadow-md transition-shadow rounded-lg" size="lg"> <ArrowLeft className="h-4 w-4" /> Voltar </Button>
                    </header>
                     {isOperatorNameRequired && ( <Card className="shadow-md border border-border/50 overflow-hidden rounded-xl"><CardHeader className="bg-muted/20 border-b border-border/30"><CardTitle className="text-xl font-semibold text-foreground flex items-center gap-2"><UserIconLc className="h-5 w-5 text-primary" />Operador</CardTitle></CardHeader><CardContent className="p-6"><div className="space-y-2"><Label htmlFor="operator-name" className="text-base font-medium">Nome</Label><Input id="operator-name" type="text" placeholder="Nome de quem fechou" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} className="h-10 text-base bg-background" disabled={isSaving} autoComplete="off" /><p className="text-xs text-muted-foreground">Obrigatório para {profile?.loja_id === 'admin' ? 'Fechamento da Simone' : 'Top Capão'}.</p></div></CardContent></Card>)}
                     <Card className="shadow-md border border-success/20 overflow-hidden rounded-xl"><CardHeader className="bg-success/5 border-b border-success/10"><CardTitle className="text-2xl font-semibold text-success flex items-center gap-3"><div className="bg-success/10 p-2 rounded-lg"><TrendingUp className="h-6 w-6 text-success" /></div>Entradas Comuns</CardTitle></CardHeader><CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-8">{entrances.map((entrance, index) => { const Icon = entrance.icon; return ( <div key={entrance.id} className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border/30 transition-shadow hover:shadow-sm"><Label htmlFor={`entrance-${entrance.id}`} className="text-lg font-semibold flex items-center gap-2.5 text-foreground/90"><Icon className="h-5 w-5 text-success" /><span>{entrance.name}</span></Label><Input id={`entrance-${entrance.id}`} type="text" inputMode="numeric" pattern="[0-9]*" value={entrance.quantity} onChange={(e) => handleEntranceChange(index, e.target.value)} placeholder="Qtde" className="w-full text-center h-10 text-base bg-background" autoComplete="off" disabled={isSaving} /><p className="text-sm text-muted-foreground text-right pt-1 font-medium">Valor Unitário: {formatCurrency(entrance.price)}</p><Separator className="my-2 border-border/20" /><p className="text-base font-semibold text-success text-right">Subtotal: {formatCurrency(entrance.price * parseInput(entrance.quantity))}</p></div> );})}</CardContent><CardFooter className="bg-success/10 px-6 py-4 mt-0 border-t border-success/20"><p className="w-full text-right text-xl font-bold text-success">Total Entradas Comuns: {formatCurrency(totalEntradasComuns)}</p></CardFooter></Card>
                    <Card className="shadow-md border border-blue-500/20 overflow-hidden rounded-xl"><CardHeader className="bg-blue-500/5 border-b border-blue-500/10"><CardTitle className="text-2xl font-semibold text-blue-600 flex items-center gap-3"><div className="bg-blue-500/10 p-2 rounded-lg"><CreditCard className="h-6 w-6 text-blue-600" /></div>Entradas Eletrônicas</CardTitle></CardHeader><CardContent className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-8">{(['pix', 'cartao', 'deposito'] as const).map((type) => { const Icon = type === 'pix' ? QrCode : type === 'cartao' ? CreditCard : Banknote; const label = type === 'pix' ? 'Pix' : type === 'cartao' ? 'Cartão' : 'Depósito'; return ( <div key={type} className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border/30 transition-shadow hover:shadow-sm"><Label htmlFor={`electronic-entry-${type}`} className="text-lg font-semibold flex items-center gap-2.5 text-foreground/90"><Icon className="h-5 w-5 text-blue-500" /><span>{label}</span></Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">R$</span><Input id={`electronic-entry-${type}`} type="text" inputMode="decimal" value={electronicEntries[type]} onChange={(e) => handleElectronicEntryChange(type, e.target.value)} placeholder="0,00" className="w-full pl-9 pr-3 text-right h-10 text-base bg-background" autoComplete="off" disabled={isSaving} /></div></div> );})}</CardContent><CardFooter className="bg-blue-500/10 px-6 py-4 mt-0 border-t border-blue-500/20"><p className="w-full text-right text-xl font-bold text-blue-600">Total Entradas Eletrônicas: {formatCurrency(totalEntradasEletronicas)}</p></CardFooter></Card>
                     <Card className="shadow-md border border-destructive/20 overflow-hidden rounded-xl"><CardHeader className="bg-destructive/5 border-b border-destructive/10"><CardTitle className="text-2xl font-semibold text-destructive flex items-center gap-3"><div className="bg-destructive/10 p-2 rounded-lg"><ReceiptText className="h-6 w-6 text-destructive" /></div>Saídas Operacionais</CardTitle></CardHeader><CardContent className="p-6 space-y-10"><div><h3 className="text-xl font-medium mb-6 text-destructive/90 border-b border-destructive/20 pb-2">Saídas Operacionais (Loja)</h3><div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end p-4 bg-muted/30 rounded-lg border border-border/50"><div className="flex-grow space-y-1 w-full sm:w-auto"><Label htmlFor="new-op-exit-name">Nome</Label><Input id="new-op-exit-name" value={newOperationalExitName} onChange={(e) => setNewOperationalExitName(e.target.value)} placeholder="Ex: Almoço" disabled={isSaving} className="h-10 bg-background text-base"/></div><div className="w-full sm:w-40 space-y-1"><Label htmlFor="new-op-exit-amount">Valor</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span><Input id="new-op-exit-amount" type="text" inputMode="decimal" value={newOperationalExitAmount} onChange={(e) => handleNewOperationalExitAmountChange(e.target.value, false)} placeholder="0,00" disabled={isSaving} className="h-10 pl-9 pr-3 text-right bg-background text-base"/></div></div><div className="w-full sm:w-[160px] space-y-1"><Label htmlFor="new-op-exit-payment-date">Data Pag.</Label><Input id="new-op-exit-payment-date" type="text" placeholder="DD/MM/AAAA" value={newOperationalExitPaymentDate} onChange={(e) => handleNewOperationalExitPaymentDateChange(e.target.value, false)} className="h-10 text-base bg-background" maxLength={10} disabled={isSaving}/></div><Button onClick={() => handleAddOperationalExit(false)} disabled={isSaving} className="w-full sm:w-auto h-10"><PlusCircle className="mr-2 h-4 w-4" />Add Saída (Loja)</Button></div>{operationalExits.length > 0 ? (<div className="space-y-3 mt-6"><h4 className="text-base font-medium text-muted-foreground">Lista de Saídas (Loja):</h4><ul className="space-y-2">{operationalExits.map(ex => (<li key={ex.id} className="flex justify-between items-center p-3 bg-muted/40 rounded-md border border-border/40"><div><span>{ex.name}</span><span className="text-xs text-muted-foreground block">Pag.: {ex.paymentDateInput}</span></div><div className="flex items-center gap-3"><span className="font-medium text-destructive">{formatCurrency(ex.amount)}</span><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive" onClick={() => handleRemoveOperationalExit(ex.id, false)} disabled={isSaving}><Trash2 className="h-4 w-4"/></Button></div></li>))}</ul><p className="text-lg pt-4 font-semibold text-right text-destructive border-t mt-6">Total Saídas (Loja): {formatCurrency(totalSaidasOperacionais)}</p></div>) : (<p className="text-sm text-muted-foreground text-center mt-8 italic">Nenhuma saída da loja.</p>)}</div>
                         {isSimoneUser && (<div className="pt-8 border-t"><h3 className="text-xl font-medium mb-6 text-destructive/90 border-b border-destructive/20 pb-2">Saídas Operacionais (Simone)</h3><div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end p-4 bg-muted/30 rounded-lg border border-border/50"><div className="flex-grow space-y-1 w-full sm:w-auto"><Label htmlFor="new-simone-op-exit-name">Nome</Label><Input id="new-simone-op-exit-name" value={newSimoneOperationalExitName} onChange={(e) => setNewSimoneOperationalExitName(e.target.value)} placeholder="Ex: Despesa Pessoal" disabled={isSaving} className="h-10 bg-background text-base"/></div><div className="w-full sm:w-40 space-y-1"><Label htmlFor="new-simone-op-exit-amount">Valor</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span><Input id="new-simone-op-exit-amount" type="text" inputMode="decimal" value={newSimoneOperationalExitAmount} onChange={(e) => handleNewOperationalExitAmountChange(e.target.value, true)} placeholder="0,00" disabled={isSaving} className="h-10 pl-9 pr-3 text-right bg-background text-base"/></div></div><div className="w-full sm:w-[160px] space-y-1"><Label htmlFor="new-simone-op-exit-payment-date">Data Pag.</Label><Input id="new-simone-op-exit-payment-date" type="text" placeholder="DD/MM/AAAA" value={newSimoneOperationalExitPaymentDate} onChange={(e) => handleNewOperationalExitPaymentDateChange(e.target.value, true)} className="h-10 text-base bg-background" maxLength={10} disabled={isSaving}/></div><Button onClick={() => handleAddOperationalExit(true)} disabled={isSaving} className="w-full sm:w-auto h-10"><PlusCircle className="mr-2 h-4 w-4" />Add Saída (Simone)</Button></div>{simoneOperationalExits.length > 0 ? (<div className="space-y-3 mt-6"><h4 className="text-base font-medium text-muted-foreground">Lista de Saídas (Simone):</h4><ul className="space-y-2">{simoneOperationalExits.map(ex => ( <li key={ex.id} className="flex justify-between items-center p-3 bg-muted/40 rounded-md border border-border/40"><div><span>{ex.name}</span><span className="text-xs text-muted-foreground block">Pag.: {ex.paymentDateInput}</span></div><div className="flex items-center gap-3"><span className="font-medium text-destructive">{formatCurrency(ex.amount)}</span><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive" onClick={() => handleRemoveOperationalExit(ex.id, true)} disabled={isSaving}><Trash2 className="h-4 w-4"/></Button></div></li>))}</ul><p className="text-lg pt-4 font-semibold text-right text-destructive border-t mt-6">Total Saídas (Simone): {formatCurrency(totalSimoneSaidasOperacionaisValue)}</p></div>) : (<p className="text-sm text-muted-foreground text-center mt-8 italic">Nenhuma saída da Simone.</p>)}</div>)}</CardContent><CardFooter className="bg-destructive/10 px-6 py-4 mt-0 border-t border-destructive/20"><p className="w-full text-right text-xl font-bold text-destructive">Total Saídas Geral: {formatCurrency(totalSaidasGeral)}</p></CardFooter></Card>
                     <Card className="bg-card shadow-lg border border-border/40 rounded-xl"><CardHeader className="border-b border-border/20 pb-4"><CardTitle className="text-2xl font-bold text-center text-foreground">Resumo Final do Caixa</CardTitle></CardHeader><CardContent className="space-y-5 text-lg px-6 pt-6 pb-6"><div className="flex justify-between items-center py-2.5"><span className="text-muted-foreground">Entradas Totais Brutas:</span><span className="font-semibold text-success">{formatCurrency(totalEntradasBrutas)}</span></div><Separator className="my-0 border-border/15"/><div className="flex justify-between items-center py-2.5"><span className="text-muted-foreground">Saídas Totais Geral:</span><span className="font-semibold text-destructive">{formatCurrency(totalSaidasGeral)}</span></div><Separator className="my-3 border-primary/20 border-dashed"/><div className="flex justify-between items-center text-xl font-bold pt-1"><span>Resultado Parcial:</span><span className={cn(resultadoParcial >= 0 ? 'text-foreground' : 'text-destructive')}>{formatCurrency(resultadoParcial)}</span></div><Separator className="my-0 border-border/15"/><div className="flex justify-between items-center py-2.5"><span className="text-muted-foreground">(-) Entradas Eletrônicas:</span><span className="font-semibold text-blue-600">{formatCurrency(totalEntradasEletronicas)}</span></div><Separator className="my-4 border-primary/20 border-dashed"/><div className="flex justify-between items-center text-xl font-bold pt-2"><span className="flex items-center gap-2"><Coins className="h-6 w-6 text-primary"/>Valor em Espécie:</span><span className={cn("px-3 py-1.5 rounded-md text-lg font-bold tracking-wider", valorEmEspecieConferencia >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>{formatCurrency(valorEmEspecieConferencia)}</span></div></CardContent></Card>

                    <footer className="flex flex-col sm:flex-row justify-end items-center mt-10 pb-4 gap-4">
                        <Button variant="outline" onClick={handleSendPdfToWhatsApp} disabled={isSaving || isLoadingPage || !fetchedClosingData} className="gap-2 px-6 h-11 text-base shadow-sm hover:shadow-md transition-shadow rounded-lg border-green-600 text-green-700 hover:bg-green-50 w-full sm:w-auto" size="lg" > <MessageSquare className="h-5 w-5"/> Enviar PDF (WhatsApp) </Button>
                        <Button onClick={handleUpdateCashier} disabled={isSaving || isLoadingPage || authLoading} className="gap-2 px-8 h-11 text-base shadow-md hover:shadow-lg transition-shadow rounded-lg w-full sm:w-auto" size="lg" > <Save className="h-5 w-5" /> {isSaving ? 'Salvando...' : 'Salvar Alterações'} </Button>
                    </footer>
                 </div>
             </main>
        </div>
    );
}
    