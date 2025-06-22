'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
    Trash2, Save, ArrowLeft, PlusCircle, Car, Truck, Bike, FileSearch, ClipboardPen, Building,
    CreditCard, QrCode, Banknote, TrendingUp, TrendingDown, Calendar as CalendarIcon,
    User as UserIconLc, type LucideIcon, CircleDollarSign, Wallet, Coins, ReceiptText, UserMinus
} from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { format, parse, isValid, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Navbar from '@/components/navbar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  loja_id: string | null; // Tornar não nulo se for obrigatório para todos os usuários ativos
  nome_operador?: string | null;
  admin?: boolean | null;
}

interface EntranceConfig {
  id: string; name: string; price: number; icon: LucideIcon;
}
interface Entrance extends EntranceConfig { quantity: string; } // quantity as string for input
interface ElectronicEntryInput { pix: string; cartao: string; deposito: string; }
interface OperationalExit { id: number; name: string; amount: number; amountInput: string; paymentDateInput: string; }
interface ReceivableInput { id: number; clientName: string; plate: string; amount: number; amountInput: string; }
interface ReceivedPayment { id: number; conta_a_receber_id: string; clientName: string; amount: number; amountInput: string; }

interface PendingReceivable { id: string; nome_cliente: string; placa: string | null; valor_receber: number; loja_id: string; }

// Data for new closing submission
interface NewClosingData {
    data_fechamento: string;
    loja_id: string;
    user_id: string;
    operator_name?: string | null;
    entradas: Record<string, number>; // { "carro": 2, "moto": 1 }
    entradas_eletronicas: { pix: number; cartao: number; deposito: number; };
    calculated_totals: CalculatedTotals;
    saidas_operacionais_loja: Omit<OperationalExit, 'id' | 'amountInput' | 'paymentDateInput' > & { data_pagamento: string | null }[];
    simone_saidas_operacionais?: Omit<OperationalExit, 'id' | 'amountInput' | 'paymentDateInput'> & { data_pagamento: string | null }[];
    novas_contas_a_receber: Omit<ReceivableInput, 'id' | 'amountInput'> & { valor: number }[];
    pagamentos_recebidos: { conta_a_receber_id: string; valor_recebido: number; }[];
}
interface CalculatedTotals {
    totalEntradasComuns: number; totalReceivedPayments: number; totalEntradasBrutas: number;
    totalEntradasEletronicas: number; totalSaidasOperacionais: number; totalSimoneSaidasOperacionais?: number;
    totalNovasContasAReceber: number; totalSaidasGeral: number; resultadoParcial: number; valorEmEspecieConferencia: number;
}


const initialEntrancesConfig: EntranceConfig[] = [
  { id: 'carro', name: 'Carro', price: 120, icon: Car },
  { id: 'caminhonete', name: 'Caminhonete', price: 140, icon: Truck },
  { id: 'caminhao', name: 'Caminhão', price: 180, icon: Truck },
  { id: 'moto', name: 'Moto', price: 100, icon: Bike },
  { id: 'cautelar', name: 'Cautelar', price: 220, icon: ClipboardPen },
  { id: 'revistoriaDetran', name: 'Revistoria DETRAN', price: 200, icon: Building },
  { id: 'pesquisaProcedencia', name: 'Pesquisa de Procedência', price: 60, icon: FileSearch },
];

const parseInputDateForStorage = (dateString: string): string | null => {
    if (!dateString || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return null;
    try {
        const parsedDate = startOfDay(parse(dateString, 'dd/MM/yyyy', new Date()));
        return isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : null;
    } catch (e) { return null; }
};
const handleDateInputChangeHelper = (value: string): string => {
    let v = value.replace(/\D/g, ''); if (v.length > 8) v = v.slice(0, 8);
    let formattedValue = '';
    if (v.length > 4) formattedValue = `${v.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
    else if (v.length > 2) formattedValue = `${v.slice(0, 2)}/${value.slice(2)}`;
    else formattedValue = v;
    return formattedValue;
};
const parseInput = (value: string | number | undefined | null): number => {
    if (typeof value === 'number') return isNaN(value) || !isFinite(value) ? 0 : value;
    if (value === '' || value === null || value === undefined) return 0;
    const cleanedValue = String(value).replace(/[^\d,.]/g, '').replace('.', '').replace(',', '.'); // Standardize to dot decimal
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
        // Format to string with 2 decimal places, using comma for decimal
        return value.toFixed(2).replace('.', ',');
     }
     // Allow only numbers and one comma
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

export default function CashierClosingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);

  const [isSaving, setIsSaving] = React.useState(false);
  const [closingDateInput, setClosingDateInput] = React.useState<string>(format(new Date(), 'dd/MM/yyyy'));
  const [operatorName, setOperatorName] = React.useState<string>('');
  const [entrances, setEntrances] = React.useState<Entrance[]>(initialEntrancesConfig.map(e => ({ ...e, quantity: '' })));
  const [electronicEntries, setElectronicEntries] = React.useState<ElectronicEntryInput>({ pix: '', cartao: '', deposito: '' });
  const [operationalExits, setOperationalExits] = React.useState<OperationalExit[]>([]);
  const [newOperationalExitName, setNewOperationalExitName] = React.useState('');
  const [newOperationalExitAmount, setNewOperationalExitAmount] = React.useState('');
  const [newOperationalExitPaymentDate, setNewOperationalExitPaymentDate] = React.useState<string>(format(new Date(), 'dd/MM/yyyy'));
  const [simoneOperationalExits, setSimoneOperationalExits] = React.useState<OperationalExit[]>([]);
  const [newSimoneOperationalExitName, setNewSimoneOperationalExitName] = React.useState('');
  const [newSimoneOperationalExitAmount, setNewSimoneOperationalExitAmount] = React.useState('');
  const [newSimoneOperationalExitPaymentDate, setNewSimoneOperationalExitPaymentDate] = React.useState<string>(format(new Date(), 'dd/MM/yyyy'));
  const [receivablesInput, setReceivablesInput] = React.useState<ReceivableInput[]>([]);
  const [receivedPayments, setReceivedPayments] = React.useState<ReceivedPayment[]>([]);
  const [newReceivableClient, setNewReceivableClient] = React.useState('');
  const [newReceivablePlate, setNewReceivablePlate] = React.useState('');
  const [newReceivableAmount, setNewReceivableAmount] = React.useState('');
  const [pendingReceivables, setPendingReceivables] = React.useState<PendingReceivable[]>([]);
  const [selectedPendingReceivable, setSelectedPendingReceivable] = React.useState<string>('');
  const [newReceivedPaymentAmount, setNewReceivedPaymentAmount] = React.useState('');
  const [isSimoneUser, setIsSimoneUser] = React.useState(false);
  const [isOperatorNameRequired, setIsOperatorNameRequired] = React.useState(false);


  React.useEffect(() => {
    console.log('[DEBUG Fechamento] useEffect iniciado');
    // Checagem inicial da sessão
    const checkInitialSession = async () => {
      setAuthLoading(true);
      console.log('[DEBUG Fechamento] Iniciando checkInitialSession');
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[DEBUG Fechamento] getSession retornou:', session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        console.log('[DEBUG Fechamento] Usuário autenticado:', currentUser.id);
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, loja_id, nome_operador, admin')
          .eq('id', currentUser.id)
          .maybeSingle();
        console.log('[DEBUG Fechamento] Resultado do fetch de perfil:', { profileData, profileError });
        if (profileError) {
          console.error('[DEBUG Fechamento] Erro ao buscar perfil:', profileError.message);
          toast({ variant: "destructive", title: "Erro de Perfil", description: "Não foi possível carregar dados do perfil." });
          setProfile(null);
          router.push('/login');
          setAuthLoading(false);
          return;
        } else {
          setProfile(profileData);
          if (profileData) {
            setOperatorName(profileData.nome_operador || '');
            setIsSimoneUser(profileData.loja_id === 'admin' || profileData.admin === true);
            setIsOperatorNameRequired(profileData.loja_id === 'capao' || profileData.loja_id === 'admin' || profileData.admin === true);
            if (profileData.loja_id && profileData.loja_id !== 'admin') {
              console.log('[DEBUG Fechamento] Buscando pendências da loja:', profileData.loja_id);
              fetchPendingReceivables(profileData.loja_id);
            } else {
              setPendingReceivables([]);
            }
          } else {
            toast({ variant: "destructive", title: "Perfil Não Configurado", description: "Contate o administrador." });
            router.push('/');
            setAuthLoading(false);
            return;
          }
        }
      } else {
        setProfile(null);
        console.warn('[DEBUG Fechamento] Nenhum usuário autenticado, redirecionando para /login');
        router.push('/login');
        setAuthLoading(false);
        return;
      }
      setAuthLoading(false);
      console.log('[DEBUG Fechamento] checkInitialSession finalizado');
    };
    checkInitialSession();
    // Listener para mudanças futuras de autenticação
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setAuthLoading(true);
      console.log('[DEBUG Fechamento] onAuthStateChange disparado:', event, session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, loja_id, nome_operador, admin')
          .eq('id', currentUser.id)
          .maybeSingle();
        console.log('[DEBUG Fechamento] onAuthStateChange perfil:', { profileData, profileError });
        if (profileError) {
          setProfile(null);
          router.push('/login');
          setAuthLoading(false);
          return;
        } else {
          setProfile(profileData);
          if (profileData) {
            setOperatorName(profileData.nome_operador || '');
            setIsSimoneUser(profileData.loja_id === 'admin' || profileData.admin === true);
            setIsOperatorNameRequired(profileData.loja_id === 'capao' || profileData.loja_id === 'admin' || profileData.admin === true);
            if (profileData.loja_id && profileData.loja_id !== 'admin') {
              fetchPendingReceivables(profileData.loja_id);
            } else {
              setPendingReceivables([]);
            }
          } else {
            toast({ variant: "destructive", title: "Perfil Não Configurado", description: "Contate o administrador." });
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
    return () => { authListener.subscription.unsubscribe(); console.log('[DEBUG Fechamento] Listener de auth removido'); };
  }, [supabase, router, toast]);


  const fetchPendingReceivables = async (lojaId: string) => {
    if (!lojaId) {
        setPendingReceivables([]);
        return;
    }
    const { data, error } = await supabase
        .from('contas_a_receber')
        .select('id, nome_cliente, placa, valor_receber, loja_id')
        .eq('loja_id', lojaId)
        .eq('status', 'pendente');

    if (error) {
        console.error("Error fetching pending receivables:", error.message);
        toast({ variant: "destructive", title: "Erro ao Buscar Pendências", description: error.message });
        setPendingReceivables([]);
    } else {
        setPendingReceivables(data || []);
    }
  };


  const resetFormState = () => {
    setClosingDateInput(format(new Date(), 'dd/MM/yyyy'));
    // Operator name set from profile, so no reset here unless profile changes
    setEntrances(initialEntrancesConfig.map(e => ({ ...e, quantity: '' })));
    setElectronicEntries({ pix: '', cartao: '', deposito: '' }); setOperationalExits([]);
    setNewOperationalExitName(''); setNewOperationalExitAmount(''); setNewOperationalExitPaymentDate(format(new Date(), 'dd/MM/yyyy'));
    setSimoneOperationalExits([]); setNewSimoneOperationalExitName(''); setNewSimoneOperationalExitAmount(''); setNewSimoneOperationalExitPaymentDate(format(new Date(), 'dd/MM/yyyy'));
    setReceivablesInput([]); setNewReceivableClient(''); setNewReceivablePlate(''); setNewReceivableAmount('');
    setReceivedPayments([]); setSelectedPendingReceivable(''); setNewReceivedPaymentAmount('');
    if(profile?.loja_id && profile.loja_id !== 'admin') fetchPendingReceivables(profile.loja_id);
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
  const handleAddOperationalExit = (isSimoneExit: boolean = false) => {
    const name = isSimoneExit ? newSimoneOperationalExitName.trim() : newOperationalExitName.trim();
    const amountStr = isSimoneExit ? newSimoneOperationalExitAmount : newOperationalExitAmount;
    const paymentDateInputStr = isSimoneExit ? newSimoneOperationalExitPaymentDate : newOperationalExitPaymentDate;
    const amount = parseInput(amountStr);
    const paymentDateParsed = parseInputDateForStorage(paymentDateInputStr);
    if (!name || amount <= 0 || !paymentDateParsed) { // Amount must be > 0
        toast({ variant: "destructive", title: "Dados Inválidos para Saída", description: "Preencha nome, valor (maior que zero) e data de pagamento válida.", duration: 3000 }); return;
    }
    const newExit = { id: Date.now(), name, amount, amountInput: amountStr, paymentDateInput: paymentDateInputStr };
    if (isSimoneExit) {
        setSimoneOperationalExits(prev => [...prev, newExit]);
        setNewSimoneOperationalExitName(''); setNewSimoneOperationalExitAmount(''); setNewSimoneOperationalExitPaymentDate(format(new Date(), 'dd/MM/yyyy'));
    } else {
        setOperationalExits(prev => [...prev, newExit]);
        setNewOperationalExitName(''); setNewOperationalExitAmount(''); setNewOperationalExitPaymentDate(format(new Date(), 'dd/MM/yyyy'));
    }
  };
  const handleRemoveOperationalExit = (id: number, isSimoneExit: boolean = false) => {
    if (isSimoneExit) setSimoneOperationalExits(prev => prev.filter(e => e.id !== id));
    else setOperationalExits(prev => prev.filter(e => e.id !== id));
  };
  const handleNewReceivableAmountChange = (value: string) => {
      setNewReceivableAmount(formatInputValue(value));
  };
  const handleAddReceivable = () => {
    const clientName = newReceivableClient.trim(); const plate = newReceivablePlate.trim().toUpperCase();
    const amountStr = newReceivableAmount; const amount = parseInput(amountStr);
    if (!clientName || !plate || amount <= 0) {
        toast({ variant: "destructive", title: "Dados Inválidos para A/R", description: "Preencha cliente, placa e valor (maior que zero).", duration: 3000 }); return;
    }
    setReceivablesInput(prev => [...prev, { id: Date.now(), clientName, plate, amount, amountInput: amountStr }]);
    setNewReceivableClient(''); setNewReceivablePlate(''); setNewReceivableAmount('');
  };
  const handleRemoveReceivableInput = (id: number) => {
    setReceivablesInput(receivablesInput.filter((item) => item.id !== id));
  };
  const handleNewReceivedPaymentAmountChange = (value: string) => {
    setNewReceivedPaymentAmount(formatInputValue(value));
  };
  const handleAddReceivedPayment = () => {
    const receivableId = selectedPendingReceivable; const amountStr = newReceivedPaymentAmount; const amount = parseInput(amountStr);
    const selectedReceivable = pendingReceivables.find(r => r.id === receivableId);
    if (!selectedReceivable || amount <= 0) {
        toast({ variant: "destructive", title: "Seleção/Valor Inválido", description: "Selecione pendência e valor (maior que zero).", duration: 3000 }); return;
    }
    if (amount > selectedReceivable.valor_receber) {
        toast({ variant: "destructive", title: "Valor Excede Pendência", description: `Recebido (${formatCurrency(amount)}) > Pendente (${formatCurrency(selectedReceivable.valor_receber)}).`, duration: 4000 }); return;
    }
    if (receivedPayments.some(p => p.conta_a_receber_id === receivableId)) {
         toast({ variant: "destructive", title: "Pagamento Já Adicionado", description: "Este pagamento já foi adicionado neste fechamento.", duration: 3000 }); return;
    }
    setReceivedPayments(prev => [...prev, { id: Date.now(), conta_a_receber_id: receivableId, clientName: selectedReceivable.nome_cliente, amount, amountInput: amountStr }]);
    setSelectedPendingReceivable(''); setNewReceivedPaymentAmount('');
  };
  const handleRemoveReceivedPayment = (id: number) => {
      setReceivedPayments(receivedPayments.filter((item) => item.id !== id));
  };
  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = handleDateInputChangeHelper(e.target.value); setClosingDateInput(formatted);
  };

  const totalEntradasComuns = React.useMemo(() => entrances.reduce((sum, en) => sum + en.price * parseInput(en.quantity), 0), [entrances]);
  const totalReceivedPayments = React.useMemo(() => receivedPayments.reduce((sum, item) => sum + item.amount, 0), [receivedPayments]);
  const totalEntradasBrutas = totalEntradasComuns + totalReceivedPayments;
  const totalEntradasEletronicas = React.useMemo(() => parseInput(electronicEntries.pix) + parseInput(electronicEntries.cartao) + parseInput(electronicEntries.deposito), [electronicEntries]);
  const totalSaidasOperacionais = React.useMemo(() => operationalExits.reduce((sum, ex) => sum + ex.amount, 0), [operationalExits]);
  const totalSimoneSaidasOperacionais = React.useMemo(() => simoneOperationalExits.reduce((sum, ex) => sum + ex.amount, 0), [simoneOperationalExits]);
  const totalNovasContasAReceber = React.useMemo(() => receivablesInput.reduce((sum, item) => sum + item.amount, 0), [receivablesInput]);
  const totalSaidasGeral = totalSaidasOperacionais + (isSimoneUser ? totalSimoneSaidasOperacionais : 0) + totalNovasContasAReceber;
  const resultadoParcial = totalEntradasBrutas - totalSaidasGeral;
  const valorEmEspecieConferencia = resultadoParcial - totalEntradasEletronicas;

  const handleSaveCashier = async () => {
    setIsSaving(true);
    const finalClosingDate = parseInputDateForStorage(closingDateInput);
    if (!finalClosingDate) {
        toast({ variant: "destructive", title: "Data Inválida", description: "Formato DD/MM/AAAA.", duration: 3000 });
        setIsSaving(false); return;
    }
    if (isOperatorNameRequired && !operatorName.trim()) {
        toast({ variant: "destructive", title: "Nome do Operador Necessário", description: "Insira o nome de quem fecha o caixa.", duration: 3000 });
        setIsSaving(false); return;
    }
    if (!user || !profile || !profile.loja_id) {
        toast({ variant: "destructive", title: "Erro de Usuário", description: "Dados do usuário ou loja não encontrados. Tente logar novamente.", duration: 3000 });
        setIsSaving(false); return;
    }

    const calculatedTotalsObj: CalculatedTotals = {
        totalEntradasComuns, totalReceivedPayments, totalEntradasBrutas,
        totalEntradasEletronicas, totalSaidasOperacionais,
        totalSimoneSaidasOperacionais: isSimoneUser ? totalSimoneSaidasOperacionais : undefined,
        totalNovasContasAReceber, totalSaidasGeral, resultadoParcial, valorEmEspecieConferencia
    };

    const fechamentoData: Omit<NewClosingData, 'saidas_operacionais_loja' | 'simone_saidas_operacionais' | 'novas_contas_a_receber' | 'pagamentos_recebidos'> = {
        data_fechamento: finalClosingDate,
        loja_id: profile.loja_id,
        user_id: user.id,
        operator_name: operatorName.trim() || null,
        entradas: Object.fromEntries(entrances.map(e => [e.id, parseInput(e.quantity)]).filter(([,qty]) => Number(qty) > 0)),
        entradas_eletronicas: { pix: parseInput(electronicEntries.pix), cartao: parseInput(electronicEntries.cartao), deposito: parseInput(electronicEntries.deposito) },
        calculated_totals: calculatedTotalsObj,
    };

    // 1. Inserir o fechamento principal
    const { data: newFechamento, error: fechamentoError } = await supabase
        .from('fechamentos')
        .insert(fechamentoData)
        .select()
        .single();

    if (fechamentoError || !newFechamento) {
        toast({ variant: "destructive", title: "Erro ao Salvar Fechamento", description: fechamentoError?.message || "Não foi possível salvar o registro principal." });
        setIsSaving(false); return;
    }

    const fechamentoId = newFechamento.id;
    let hasErrorsInSubOperations = false;

    // 2. Inserir saídas operacionais da loja
    if (operationalExits.length > 0) {
        const saidasLojaData = operationalExits.map(e => ({
            fechamento_id: fechamentoId,
            nome: e.name,
            valor: e.amount,
            data_pagamento: parseInputDateForStorage(e.paymentDateInput) as string // Cast as string, already validated
        }));
        const { error: saidasLojaError } = await supabase.from('fechamento_saidas_operacionais').insert(saidasLojaData);
        if (saidasLojaError) {
            toast({ variant: "destructive", title: "Erro ao Salvar Saídas da Loja", description: saidasLojaError.message });
            hasErrorsInSubOperations = true;
        }
    }

    // 3. Inserir saídas operacionais da Simone (se aplicável)
    if (isSimoneUser && simoneOperationalExits.length > 0) {
        const saidasSimoneData = simoneOperationalExits.map(e => ({
            fechamento_id: fechamentoId,
            nome: e.name,
            valor: e.amount,
            data_pagamento: parseInputDateForStorage(e.paymentDateInput) as string
        }));
        const { error: saidasSimoneError } = await supabase.from('fechamento_simone_saidas_operacionais').insert(saidasSimoneData);
        if (saidasSimoneError) {
            toast({ variant: "destructive", title: "Erro ao Salvar Saídas da Simone", description: saidasSimoneError.message });
            hasErrorsInSubOperations = true;
        }
    }

    // 4. Inserir novas contas a receber
    if (receivablesInput.length > 0) {
        const novasContasData = receivablesInput.map(r => ({
            loja_id: profile.loja_id as string, // loja_id is checked to be non-null
            nome_cliente: r.clientName,
            placa: r.plate,
            valor_receber: r.amount,
            data_debito: finalClosingDate,
            status: 'pendente',
            fechamento_id_origem: fechamentoId
        }));
        const { error: novasContasError } = await supabase.from('contas_a_receber').insert(novasContasData);
        if (novasContasError) {
            toast({ variant: "destructive", title: "Erro ao Salvar Novas Contas a Receber", description: novasContasError.message });
            hasErrorsInSubOperations = true;
        }
    }

    // 5. Registrar pagamentos recebidos e atualizar contas_a_receber
    if (receivedPayments.length > 0) {
        const recebimentosRegistradosData = receivedPayments.map(p => ({
            fechamento_id: fechamentoId,
            conta_a_receber_id: p.conta_a_receber_id,
            valor_recebido: p.amount
        }));
        const { error: recebimentosError } = await supabase.from('fechamento_recebimentos_registrados').insert(recebimentosRegistradosData);
        if (recebimentosError) {
            toast({ variant: "destructive", title: "Erro ao Registrar Recebimentos", description: recebimentosError.message });
            hasErrorsInSubOperations = true;
        } else {
            // Atualizar status das contas_a_receber
            for (const payment of receivedPayments) {
                const { error: updateError } = await supabase
                    .from('contas_a_receber')
                    .update({
                        status: 'pago_pendente_baixa',
                        data_pagamento_efetivo: finalClosingDate,
                        fechamento_id_pagamento: fechamentoId
                    })
                    .eq('id', payment.conta_a_receber_id);
                if (updateError) {
                    toast({ variant: "destructive", title: "Erro ao Atualizar Status A/R", description: `Cliente ${payment.clientName}: ${updateError.message}` });
                    hasErrorsInSubOperations = true;
                }
            }
        }
    }

    setIsSaving(false);
    if (hasErrorsInSubOperations) {
        toast({ title: "Operação Parcialmente Concluída", description: "Alguns dados podem não ter sido salvos. Verifique o histórico ou contate o suporte.", duration: 5000 });
    } else {
        toast({ title: "Sucesso!", description: "Fechamento de caixa salvo com sucesso.", duration: 3000 });
        resetFormState();
        router.push('/');
    }
  };


  if (authLoading || !profile) { // Added !profile check
    return (
         <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
             <Navbar />
             <main className="flex-grow container mx-auto px-4 md:px-8 py-8 w-full flex items-center justify-center">
                 <p>Carregando dados do usuário...</p>
             </main>
         </div>
    );
  }

  return (
     <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
         <Navbar />
         <main className="flex-grow container mx-auto px-4 md:px-8 py-8 w-full">
            <div className="w-full max-w-5xl space-y-8 mx-auto">
                 <header className="flex flex-wrap justify-between items-center mb-8 gap-4">
                     <h1 className="text-3xl font-bold text-foreground tracking-tight">Novo Fechamento de Caixa</h1>
                      <Button variant="outline" onClick={() => router.push('/')} disabled={isSaving} className="gap-2 h-11 shadow-sm hover:shadow-md transition-shadow rounded-lg" size="lg">
                           <ArrowLeft className="h-4 w-4" /> Voltar ao Painel
                      </Button>
                 </header>

                  <Card className="shadow-md border border-border/50 overflow-hidden rounded-xl">
                      <CardHeader className="bg-muted/20 border-b border-border/30">
                         <CardTitle className="text-xl font-semibold text-foreground flex items-center gap-3"> Informações do Fechamento </CardTitle>
                     </CardHeader>
                     <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="space-y-2">
                             <Label htmlFor="closing-date" className="text-lg font-semibold flex items-center gap-2.5 text-foreground/90">
                                 <CalendarIcon className="h-5 w-5 text-primary" /> Data do Fechamento
                             </Label>
                             <Input id="closing-date" type="text" placeholder="DD/MM/AAAA" value={closingDateInput} onChange={handleDateInputChange} className="h-10 text-base bg-background" maxLength={10} disabled={isSaving} autoComplete="off" />
                             <p className="text-xs text-muted-foreground">Use o formato Dia/Mês/Ano.</p>
                         </div>
                         {isOperatorNameRequired && (
                             <div className="space-y-2">
                                 <Label htmlFor="operator-name" className="text-lg font-semibold flex items-center gap-2.5 text-foreground/90">
                                    <UserIconLc className="h-5 w-5 text-primary" /> Nome do Operador
                                 </Label>
                                 <Input id="operator-name" type="text" placeholder="Nome de quem fechou" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} className="h-10 text-base bg-background" disabled={isSaving} autoComplete="off" />
                                   <p className="text-xs text-muted-foreground">Obrigatório para {profile?.loja_id === 'admin' ? 'Fechamento da Simone' : 'Top Capão'}.</p>
                             </div>
                         )}
                     </CardContent>
                  </Card>

                 <Card className="shadow-md border border-success/20 overflow-hidden rounded-xl">
                     <CardHeader className="bg-success/5 border-b border-success/10"><CardTitle className="text-2xl font-semibold text-success flex items-center gap-3"><div className="bg-success/10 p-2 rounded-lg"> <TrendingUp className="h-6 w-6 text-success" /> </div> Entradas Comuns</CardTitle></CardHeader>
                     <CardContent className="p-6">
                         <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-8 mb-10">
                             {entrances.map((entrance, index) => {
                                 const Icon = entrance.icon;
                                 return (<div key={entrance.id} className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border/30 transition-shadow hover:shadow-sm"><Label htmlFor={`entrance-${entrance.id}`} className="text-lg font-semibold flex items-center gap-2.5 text-foreground/90"><Icon className="h-5 w-5 text-success" /> <span>{entrance.name}</span></Label><Input id={`entrance-${entrance.id}`} type="text" inputMode="numeric" pattern="[0-9]*" value={entrance.quantity} onChange={(e) => handleEntranceChange(index, e.target.value)} placeholder="Qtde" className="w-full text-center h-10 text-base bg-background" autoComplete="off" disabled={isSaving} /><p className="text-sm text-muted-foreground text-right pt-1 font-medium">Valor Unitário: {formatCurrency(entrance.price)}</p><Separator className="my-2 border-border/20" /><p className="text-base font-semibold text-success text-right">Subtotal: {formatCurrency(entrance.price * parseInput(entrance.quantity))}</p></div>);
                             })}
                         </div>
                         <p className="text-lg pt-6 font-semibold text-right text-success border-t border-border/30 mt-8"> Total Entradas Comuns: {formatCurrency(totalEntradasComuns)} </p>
                          <div className="space-y-6 pt-8 border-t border-border/50 mt-8">
                              <h3 className="text-xl font-medium text-success/90 border-b border-success/20 pb-2 mb-6 flex items-center gap-2"><Wallet className="h-5 w-5 text-success"/> Adicionar Pagamento Pendente Recebido</h3>
                              {pendingReceivables.length > 0 ? (<div className="flex flex-col md:flex-row gap-4 items-start md:items-end p-4 bg-muted/30 rounded-lg border border-border/50"><div className="flex-grow space-y-1 w-full"><Label htmlFor="pending-receivable-select" className="text-sm font-medium">Cliente/Vistoria Pendente</Label><Select value={selectedPendingReceivable} onValueChange={setSelectedPendingReceivable} disabled={isSaving}><SelectTrigger id="pending-receivable-select" className="h-10 bg-background text-base"><SelectValue placeholder="Selecione um cliente/vistoria" /></SelectTrigger><SelectContent>{pendingReceivables.map((item) => (<SelectItem key={item.id} value={item.id}>{item.nome_cliente} ({item.placa || 'S/Placa'}) - {formatCurrency(item.valor_receber)}</SelectItem>))}</SelectContent></Select></div><div className="w-full md:w-40 space-y-1"><Label htmlFor="new-received-payment-amount" className="text-sm font-medium">Valor Recebido</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">R$</span><Input id="new-received-payment-amount" type="text" inputMode="decimal" value={newReceivedPaymentAmount} onChange={(e) => handleNewReceivedPaymentAmountChange(e.target.value)} placeholder="0,00" disabled={isSaving} className="h-10 pl-9 pr-3 text-right bg-background text-base" autoComplete="off" /></div></div><Button onClick={handleAddReceivedPayment} disabled={isSaving} className="w-full md:w-auto h-10 mt-2 md:mt-0" size="default"><PlusCircle className="mr-2 h-4 w-4" /> Adicionar Pagamento</Button></div>
                              ) : ( <p className="text-sm text-muted-foreground text-center italic py-4">Nenhuma vistoria pendente encontrada para sua loja.</p> )}
                               {receivedPayments.length > 0 && (<div className="space-y-3 mt-6"><h4 className="text-base font-medium text-muted-foreground">Pagamentos Pendentes Recebidos:</h4><ul className="space-y-2">{receivedPayments.map((item) => (<li key={item.id} className="flex justify-between items-center p-3 bg-muted/40 rounded-md border border-border/40 text-base"><span className="text-foreground flex-1 mr-4 break-words">{item.clientName}</span><div className="flex items-center gap-3"><span className="font-medium text-success">{formatCurrency(item.amount)}</span><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10 disabled:opacity-50" onClick={() => handleRemoveReceivedPayment(item.id)} disabled={isSaving} aria-label={`Remover ${item.clientName}`}><Trash2 className="h-4 w-4" /><span className="sr-only">Remover</span></Button></div></li>))}</ul><p className="text-lg pt-4 font-semibold text-right text-success border-t border-border/30 mt-6">Total Pagamentos Pendentes Recebidos: {formatCurrency(totalReceivedPayments)}</p></div>)}
                          </div>
                     </CardContent>
                      <CardFooter className="bg-success/10 px-6 py-4 mt-0 border-t border-success/20"><p className="w-full text-right text-xl font-bold text-success">Total Entradas Brutas: {formatCurrency(totalEntradasBrutas)}</p></CardFooter>
                 </Card>

                <Card className="shadow-md border border-blue-500/20 overflow-hidden rounded-xl">
                    <CardHeader className="bg-blue-500/5 border-b border-blue-500/10"><CardTitle className="text-2xl font-semibold text-blue-600 flex items-center gap-3"><div className="bg-blue-500/10 p-2 rounded-lg"><CreditCard className="h-6 w-6 text-blue-600" /></div>Entradas Eletrônicas</CardTitle></CardHeader>
                    <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-8">
                        {(['pix', 'cartao', 'deposito'] as const).map((type) => {
                            const Icon = type === 'pix' ? QrCode : type === 'cartao' ? CreditCard : Banknote;
                            const label = type === 'pix' ? 'Pix' : type === 'cartao' ? 'Cartão' : 'Depósito';
                            return (<div key={type} className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border/30 transition-shadow hover:shadow-sm"><Label htmlFor={`electronic-entry-${type}`} className="text-lg font-semibold flex items-center gap-2.5 text-foreground/90"><Icon className="h-5 w-5 text-blue-500" /><span>{label}</span></Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">R$</span><Input id={`electronic-entry-${type}`} type="text" inputMode="decimal" value={electronicEntries[type]} onChange={(e) => handleElectronicEntryChange(type, e.target.value)} placeholder="0,00" className="w-full pl-9 pr-3 text-right h-10 text-base bg-background" autoComplete="off" disabled={isSaving} /></div></div>);
                        })}
                    </CardContent>
                    <CardFooter className="bg-blue-500/10 px-6 py-4 mt-0 border-t border-blue-500/20"><p className="w-full text-right text-xl font-bold text-blue-600">Total Entradas Eletrônicas: {formatCurrency(totalEntradasEletronicas)}</p></CardFooter>
                </Card>

                  <Card className="shadow-md border border-destructive/20 overflow-hidden rounded-xl">
                     <CardHeader className="bg-destructive/5 border-b border-destructive/10"><CardTitle className="text-2xl font-semibold text-destructive flex items-center gap-3"><div className="bg-destructive/10 p-2 rounded-lg"><TrendingDown className="h-6 w-6 text-destructive" /></div>Saídas e Novas Contas a Receber</CardTitle></CardHeader>
                     <CardContent className="p-6 space-y-10">
                         <div className="space-y-6"><h3 className="text-xl font-medium text-destructive/90 border-b border-destructive/20 pb-2 mb-6 flex items-center gap-2"><ReceiptText className="h-5 w-5 text-destructive"/>Saídas Operacionais (Loja)</h3><div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end p-4 bg-muted/30 rounded-lg border border-border/50"><div className="flex-grow space-y-1 w-full sm:w-auto"><Label htmlFor="new-operational-exit-name" className="text-sm font-medium">Nome da Saída</Label><Input id="new-operational-exit-name" value={newOperationalExitName} onChange={(e) => setNewOperationalExitName(e.target.value)} placeholder="Ex: Material de Limpeza" disabled={isSaving} className="h-10 bg-background text-base" /></div><div className="w-full sm:w-40 space-y-1"><Label htmlFor="new-operational-exit-amount" className="text-sm font-medium">Valor</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">R$</span><Input id="new-operational-exit-amount" type="text" inputMode="decimal" value={newOperationalExitAmount} onChange={(e) => handleNewOperationalExitAmountChange(e.target.value, false)} placeholder="0,00" disabled={isSaving} className="h-10 pl-9 pr-3 text-right bg-background text-base" autoComplete="off" /></div></div><div className="w-full sm:w-[160px] space-y-1"><Label htmlFor="new-operational-exit-payment-date" className="text-sm font-medium">Data Pagamento</Label><Input id="new-operational-exit-payment-date" type="text" placeholder="DD/MM/AAAA" value={newOperationalExitPaymentDate} onChange={(e) => handleNewOperationalExitPaymentDateChange(e.target.value, false)} className="h-10 text-base bg-background" maxLength={10} disabled={isSaving} /></div><Button onClick={() => handleAddOperationalExit(false)} disabled={isSaving} className="w-full sm:w-auto h-10 mt-2 sm:mt-0" size="default"><PlusCircle className="mr-2 h-4 w-4" />Adicionar Saída</Button></div>
                             {operationalExits.length > 0 ? (<div className="space-y-3 mt-6"><h4 className="text-base font-medium text-muted-foreground">Lista de Saídas Operacionais (Loja):</h4><ul className="space-y-2">{operationalExits.map((exit) => (<li key={exit.id} className="flex justify-between items-center p-3 bg-muted/40 rounded-md border border-border/40 text-base"><div><span className="text-foreground flex-1 mr-4 break-words">{exit.name}</span><span className="text-xs text-muted-foreground block">Pag.: {exit.paymentDateInput}</span></div><div className="flex items-center gap-3"><span className="font-medium text-destructive">{formatCurrency(exit.amount)}</span><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10 disabled:opacity-50" onClick={() => handleRemoveOperationalExit(exit.id, false)} disabled={isSaving} aria-label={`Remover ${exit.name}`}><Trash2 className="h-4 w-4" /><span className="sr-only">Remover</span></Button></div></li>))}</ul><p className="text-lg pt-4 font-semibold text-right text-destructive border-t border-border/30 mt-6">Total Saídas Operacionais (Loja): {formatCurrency(totalSaidasOperacionais)}</p></div>) : (<p className="text-sm text-muted-foreground text-center mt-8 italic">Nenhuma saída operacional da loja adicionada.</p>)}</div>
                         {isSimoneUser && (<div className="space-y-6 pt-8 border-t border-border/50"><h3 className="text-xl font-medium text-destructive/90 border-b border-destructive/20 pb-2 mb-6 flex items-center gap-2"><UserMinus className="h-5 w-5 text-destructive"/>Saídas Operacionais (Simone)</h3><div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end p-4 bg-muted/30 rounded-lg border border-border/50"><div className="flex-grow space-y-1 w-full sm:w-auto"><Label htmlFor="new-simone-operational-exit-name" className="text-sm font-medium">Nome da Saída (Simone)</Label><Input id="new-simone-operational-exit-name" value={newSimoneOperationalExitName} onChange={(e) => setNewSimoneOperationalExitName(e.target.value)} placeholder="Ex: Despesa Pessoal" disabled={isSaving} className="h-10 bg-background text-base" /></div><div className="w-full sm:w-40 space-y-1"><Label htmlFor="new-simone-operational-exit-amount" className="text-sm font-medium">Valor</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">R$</span><Input id="new-simone-operational-exit-amount" type="text" inputMode="decimal" value={newSimoneOperationalExitAmount} onChange={(e) => handleNewOperationalExitAmountChange(e.target.value, true)} placeholder="0,00" disabled={isSaving} className="h-10 pl-9 pr-3 text-right bg-background text-base" autoComplete="off" /></div></div><div className="w-full sm:w-[160px] space-y-1"><Label htmlFor="new-simone-operational-exit-payment-date" className="text-sm font-medium">Data Pagamento</Label><Input id="new-simone-operational-exit-payment-date" type="text" placeholder="DD/MM/AAAA" value={newSimoneOperationalExitPaymentDate} onChange={(e) => handleNewOperationalExitPaymentDateChange(e.target.value, true)} className="h-10 text-base bg-background" maxLength={10} disabled={isSaving}/></div><Button onClick={() => handleAddOperationalExit(true)} disabled={isSaving} className="w-full sm:w-auto h-10 mt-2 sm:mt-0" size="default"><PlusCircle className="mr-2 h-4 w-4" />Adicionar Saída (Simone)</Button></div>
                             {simoneOperationalExits.length > 0 ? (<div className="space-y-3 mt-6"><h4 className="text-base font-medium text-muted-foreground">Lista de Saídas Operacionais (Simone):</h4><ul className="space-y-2">{simoneOperationalExits.map((exit) => (<li key={exit.id} className="flex justify-between items-center p-3 bg-muted/40 rounded-md border border-border/40 text-base"><div><span className="text-foreground flex-1 mr-4 break-words">{exit.name}</span><span className="text-xs text-muted-foreground block">Pag.: {exit.paymentDateInput}</span></div><div className="flex items-center gap-3"><span className="font-medium text-destructive">{formatCurrency(exit.amount)}</span><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10 disabled:opacity-50" onClick={() => handleRemoveOperationalExit(exit.id, true)} disabled={isSaving} aria-label={`Remover ${exit.name}`}><Trash2 className="h-4 w-4" /><span className="sr-only">Remover</span></Button></div></li>))}</ul><p className="text-lg pt-4 font-semibold text-right text-destructive border-t border-border/30 mt-6">Total Saídas Operacionais (Simone): {formatCurrency(totalSimoneSaidasOperacionais)}</p></div>) : (<p className="text-sm text-muted-foreground text-center mt-8 italic">Nenhuma saída operacional da Simone adicionada.</p>)}</div>)}
                         <div className="space-y-6 pt-8 border-t border-border/50"><h3 className="text-xl font-medium text-primary/90 border-b border-primary/20 pb-2 mb-6 flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-primary"/>Adicionar Nova Conta A Receber</h3><div className="flex flex-col md:flex-row gap-4 items-start md:items-end p-4 bg-muted/30 rounded-lg border border-border/50"><div className="flex-grow space-y-1 w-full"><Label htmlFor="new-receivable-client" className="text-sm font-medium">Nome do Cliente</Label><Input id="new-receivable-client" value={newReceivableClient} onChange={(e) => setNewReceivableClient(e.target.value)} placeholder="Nome Completo" disabled={isSaving} className="h-10 bg-background text-base" /></div><div className="w-full md:w-auto space-y-1"><Label htmlFor="new-receivable-plate" className="text-sm font-medium">Placa</Label><Input id="new-receivable-plate" value={newReceivablePlate} onChange={(e) => setNewReceivablePlate(e.target.value.toUpperCase())} placeholder="AAA-0000" disabled={isSaving} className="h-10 bg-background text-base uppercase" maxLength={8} /></div><div className="w-full md:w-40 space-y-1"><Label htmlFor="new-receivable-amount" className="text-sm font-medium">Valor a Receber</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">R$</span><Input id="new-receivable-amount" type="text" inputMode="decimal" value={newReceivableAmount} onChange={(e) => handleNewReceivableAmountChange(e.target.value)} placeholder="0,00" disabled={isSaving} className="h-10 pl-9 pr-3 text-right bg-background text-base" autoComplete="off" /></div></div><Button onClick={handleAddReceivable} disabled={isSaving} className="w-full md:w-auto h-10 mt-2 md:mt-0" size="default"><PlusCircle className="mr-2 h-4 w-4" />Adicionar A Receber</Button></div>
                             {receivablesInput.length > 0 ? (<div className="space-y-3 mt-6"><h4 className="text-base font-medium text-muted-foreground">Contas a Receber Criadas Neste Fechamento:</h4><ul className="space-y-2">{receivablesInput.map((item) => (<li key={item.id} className="flex justify-between items-center p-3 bg-muted/40 rounded-md border border-border/40 text-base"><div className="flex-1 mr-4 break-words"><span className="font-semibold text-foreground">{item.clientName}</span><span className="text-xs text-muted-foreground block">Placa: {item.plate}</span></div><div className="flex items-center gap-3"><span className="font-medium text-primary">{formatCurrency(item.amount)}</span><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10 disabled:opacity-50" onClick={() => handleRemoveReceivableInput(item.id)} disabled={isSaving} aria-label={`Remover ${item.clientName}`}><Trash2 className="h-4 w-4" /><span className="sr-only">Remover</span></Button></div></li>))}</ul><p className="text-lg pt-4 font-semibold text-right text-primary border-t border-border/30 mt-6">Total Novas Contas A Receber: {formatCurrency(totalNovasContasAReceber)}</p></div>) : (<p className="text-sm text-muted-foreground text-center mt-8 italic">Nenhuma nova conta a receber criada.</p>)}</div>
                     </CardContent>
                      <CardFooter className="bg-destructive/10 px-6 py-4 mt-0 border-t border-destructive/20"><p className="w-full text-right text-xl font-bold text-destructive">Total Saídas Geral: {formatCurrency(totalSaidasGeral)}</p></CardFooter>
                 </Card>

                 <Card className="bg-card shadow-lg border border-border/40 rounded-xl">
                     <CardHeader className="border-b border-border/20 pb-4"><CardTitle className="text-2xl font-bold text-center text-foreground">Resumo Final do Caixa</CardTitle></CardHeader>
                     <CardContent className="space-y-5 text-lg px-6 pt-6 pb-6">
                         <div className="flex justify-between items-center py-2.5"><span className="text-muted-foreground">Entradas Totais Brutas:</span><span className="font-semibold text-success">{formatCurrency(totalEntradasBrutas)}</span></div><Separator className="my-0 border-border/15"/>
                         <div className="flex justify-between items-center py-2.5"><span className="text-muted-foreground">Saídas Totais Geral:</span><span className="font-semibold text-destructive">{formatCurrency(totalSaidasGeral)}</span></div><Separator className="my-3 border-primary/20 border-dashed"/>
                         <div className="flex justify-between items-center text-xl font-bold pt-1"><span>Resultado Parcial:</span><span className={cn(resultadoParcial >= 0 ? 'text-foreground' : 'text-destructive')}>{formatCurrency(resultadoParcial)}</span></div><Separator className="my-0 border-border/15"/>
                          <div className="flex justify-between items-center py-2.5"><span className="text-muted-foreground">(-) Entradas Eletrônicas:</span><span className="font-semibold text-blue-600">{formatCurrency(totalEntradasEletronicas)}</span></div><Separator className="my-4 border-primary/20 border-dashed"/>
                         <div className="flex justify-between items-center text-xl font-bold pt-2"><span className="flex items-center gap-2"><Coins className="h-6 w-6 text-primary"/>Valor em Espécie para Conferência:</span><span className={cn("px-3 py-1.5 rounded-md text-lg font-bold tracking-wider", valorEmEspecieConferencia >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>{formatCurrency(valorEmEspecieConferencia)}</span></div>
                         <p className="text-xs text-muted-foreground mt-2 text-center">(Entradas Brutas - Saídas Gerais - Entradas Eletrônicas)</p>
                     </CardContent>
                 </Card>

                 <footer className="flex justify-end items-center mt-10 pb-4">
                     <Button onClick={handleSaveCashier} disabled={isSaving || authLoading} className="gap-2 px-8 h-11 text-base shadow-md hover:shadow-lg transition-shadow rounded-lg" size="lg" >
                         <Save className="h-5 w-5" /> {isSaving ? 'Salvando...' : 'Salvar Fechamento'}
                     </Button>
                 </footer>
            </div>
         </main>
     </div>
  );
}
    