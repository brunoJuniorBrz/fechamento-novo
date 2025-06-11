'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/navbar';
import { ArrowLeft } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import FechamentoForm from '@/components/fechamento/FechamentoForm'; // Importar o novo componente
import type { FechamentoFormData, Profile as FechamentoProfile, PendingReceivable } from '@/components/fechamento/FechamentoForm'; // Tipos do formulário

/**
 * Página para criar um novo fechamento de caixa.
 * Utiliza o componente FechamentoForm para renderizar e gerenciar o formulário.
 */
export default function NewCashierClosingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<FechamentoProfile | null>(null); // Usar o tipo do formulário
  const [authLoading, setAuthLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [pendingReceivables, setPendingReceivables] = React.useState<PendingReceivable[]>([]);
  const [initialLoading, setInitialLoading] = React.useState(true); // Para carregamento de perfil e pendências

  React.useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setAuthLoading(true);
      setInitialLoading(true);
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, loja_id, nome_operador, admin')
          .eq('id', currentUser.id)
          .maybeSingle();

        if (profileError) {
          console.error("Error fetching profile for New FechamentoPage:", profileError.message);
          toast({ variant: "destructive", title: "Erro de Perfil", description: "Não foi possível carregar dados do perfil." });
          setProfile(null);
          router.push('/login');
          setAuthLoading(false);
          setInitialLoading(false);
          return;
        }

        setProfile(profileData as FechamentoProfile | null);

        if (profileData?.loja_id && profileData.loja_id !== 'admin') {
          await fetchPendingReceivablesForStore(profileData.loja_id);
        } else {
          setPendingReceivables([]);
        }

      } else {
        setProfile(null);
        router.push('/login');
      }
      setAuthLoading(false);
      setInitialLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase, router, toast]);

  const fetchPendingReceivablesForStore = async (lojaId: string) => {
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
        console.error("Error fetching pending receivables for store:", error.message);
        toast({ variant: "destructive", title: "Erro ao Buscar Pendências da Loja", description: error.message });
        setPendingReceivables([]);
    } else {
        setPendingReceivables(data as PendingReceivable[] || []);
    }
  };

  /**
   * Função para salvar um novo fechamento.
   * Chamada pelo componente FechamentoForm.
   * @param {FechamentoFormData} formData - Dados do formulário.
   */
  const handleSaveNewClosing = async (formData: FechamentoFormData) => {
    setIsSaving(true);
    let hasErrorsInSubOperations = false;

    // 1. Inserir o fechamento principal
    const { data: newFechamento, error: fechamentoError } = await supabase
        .from('fechamentos')
        .insert({ // Omitir campos de sub-operações aqui, eles são tratados separadamente
            data_fechamento: formData.data_fechamento,
            loja_id: formData.loja_id,
            user_id: formData.user_id,
            operator_name: formData.operator_name,
            entradas: formData.entradas,
            entradas_eletronicas: formData.entradas_eletronicas,
            calculated_totals: formData.calculated_totals,
        })
        .select()
        .single();

    if (fechamentoError || !newFechamento) {
        toast({ variant: "destructive", title: "Erro ao Salvar Fechamento", description: fechamentoError?.message || "Não foi possível salvar o registro principal." });
        setIsSaving(false);
        return;
    }

    const fechamentoId = newFechamento.id;

    // 2. Inserir saídas operacionais da loja
    if (formData.saidas_operacionais_loja.length > 0) {
        const saidasLojaData = formData.saidas_operacionais_loja.map(e => ({
            fechamento_id: fechamentoId, ...e
        }));
        const { error: saidasLojaError } = await supabase.from('fechamento_saidas_operacionais').insert(saidasLojaData);
        if (saidasLojaError) {
            toast({ variant: "destructive", title: "Erro ao Salvar Saídas da Loja", description: saidasLojaError.message, duration: 7000 });
            hasErrorsInSubOperations = true;
        }
    }

    // 3. Inserir saídas operacionais da Simone (se aplicável)
    if (formData.simone_saidas_operacionais && formData.simone_saidas_operacionais.length > 0) {
        const saidasSimoneData = formData.simone_saidas_operacionais.map(e => ({
            fechamento_id: fechamentoId, ...e
        }));
        const { error: saidasSimoneError } = await supabase.from('fechamento_simone_saidas_operacionais').insert(saidasSimoneData);
        if (saidasSimoneError) {
            toast({ variant: "destructive", title: "Erro ao Salvar Saídas da Simone", description: saidasSimoneError.message, duration: 7000 });
            hasErrorsInSubOperations = true;
        }
    }

    // 4. Inserir novas contas a receber
    if (formData.novas_contas_a_receber.length > 0) {
        const novasContasData = formData.novas_contas_a_receber.map(r => ({
            loja_id: formData.loja_id,
            nome_cliente: r.nome_cliente,
            placa: r.placa,
            valor_receber: r.valor, // 'valor' é o campo correto aqui
            data_debito: formData.data_fechamento,
            status: 'pendente',
            fechamento_id_origem: fechamentoId
        }));
        const { error: novasContasError } = await supabase.from('contas_a_receber').insert(novasContasData);
        if (novasContasError) {
            toast({ variant: "destructive", title: "Erro ao Salvar Novas Contas a Receber", description: novasContasError.message, duration: 7000 });
            hasErrorsInSubOperations = true;
        }
    }

    // 5. Registrar pagamentos recebidos e atualizar contas_a_receber
    if (formData.pagamentos_recebidos.length > 0) {
        const recebimentosRegistradosData = formData.pagamentos_recebidos.map(p => ({
            fechamento_id: fechamentoId,
            conta_a_receber_id: p.conta_a_receber_id,
            valor_recebido: p.valor_recebido
        }));
        const { error: recebimentosError } = await supabase.from('fechamento_recebimentos_registrados').insert(recebimentosRegistradosData);
        if (recebimentosError) {
            toast({ variant: "destructive", title: "Erro ao Registrar Recebimentos", description: recebimentosError.message, duration: 7000 });
            hasErrorsInSubOperations = true;
        } else {
            for (const payment of formData.pagamentos_recebidos) {
                const { error: updateError } = await supabase
                    .from('contas_a_receber')
                    .update({
                        status: 'pago_pendente_baixa',
                        data_pagamento_efetivo: formData.data_fechamento, // Usar a data do fechamento como data de pagamento efetivo
                        fechamento_id_pagamento: fechamentoId
                    })
                    .eq('id', payment.conta_a_receber_id);
                if (updateError) {
                    toast({ variant: "destructive", title: "Erro ao Atualizar Status A/R", description: `ID ${payment.conta_a_receber_id}: ${updateError.message}`, duration: 7000 });
                    hasErrorsInSubOperations = true;
                }
            }
        }
    }

    setIsSaving(false);
    if (hasErrorsInSubOperations) {
        toast({ title: "Operação Parcialmente Concluída", description: "O fechamento principal foi salvo, mas alguns dados relacionados podem não ter sido salvos. Verifique o histórico ou contate o suporte.", duration: 8000 });
        router.push(`/historico/${formData.data_fechamento}?docId=${fechamentoId}&lojaId=${formData.loja_id}`); // Leva para a tela de histórico para conferência
    } else {
        toast({ title: "Sucesso!", description: "Fechamento de caixa salvo com sucesso.", duration: 3000 });
        router.push('/'); // Volta para a Home page após salvar com sucesso
    }
  };

  if (authLoading || initialLoading || !profile || !user) {
    return (
         <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
             <Navbar />
             <main className="flex-grow container mx-auto px-4 md:px-8 py-8 w-full flex items-center justify-center">
                 <p>Carregando dados do usuário e da loja...</p>
             </main>
         </div>
    );
  }

  if (!profile.loja_id) {
    return (
         <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
             <Navbar />
             <main className="flex-grow container mx-auto px-4 md:px-8 py-8 w-full flex items-center justify-center">
                 <div className="text-center p-8 bg-card rounded-lg shadow-md border">
                    <h2 className="text-xl font-semibold text-destructive">Loja Não Configurada</h2>
                    <p className="text-muted-foreground mt-2">Sua loja não está definida no perfil. Por favor, contate o administrador.</p>
                    <Button onClick={() => router.push('/')} className="mt-4">Voltar ao Painel</Button>
                 </div>
             </main>
         </div>
    );
  }

  return (
     <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
         <Navbar />
         <main className="flex-grow container mx-auto px-4 md:px-8 py-8 w-full">
            <header className="flex flex-wrap justify-between items-center mb-8 gap-4">
                <h1 className="text-3xl font-bold text-foreground tracking-tight">Novo Fechamento de Caixa</h1>
                <Button variant="outline" onClick={() => router.push('/')} disabled={isSaving} className="gap-2 h-11 shadow-sm hover:shadow-md transition-shadow rounded-lg" size="lg">
                    <ArrowLeft className="h-4 w-4" /> Voltar ao Painel
                </Button>
            </header>
            <FechamentoForm
                lojaId={profile.loja_id}
                profile={profile}
                user={user}
                onSave={handleSaveNewClosing}
                isSavingGlobal={isSaving}
                isEditing={false}
                pendingReceivablesForStore={pendingReceivables}
            />
         </main>
     </div>
  );
}
