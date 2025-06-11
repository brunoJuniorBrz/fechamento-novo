// @ts-nocheck
// TODO: Adicionar tipos mais precisos, especialmente para initialData.
'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Navbar from '@/components/navbar';
import { ArrowLeft, Save, Download, MessageSquare } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { format as formatDateFns, parse as parseDateFns, isValid as isValidDateFns } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import FechamentoForm from '@/components/fechamento/FechamentoForm'; // Importar o novo componente
import type { FechamentoFormData, Profile as FechamentoProfile, FetchedClosingData as FormInitialData } from '@/components/fechamento/FechamentoForm'; // Tipos do formulário

// Dummy PDF generation function (placeholder)
const generatePdfDummy = () => {
    console.log("generatePdf called (dummy - implement with new PDF library if needed)");
    alert("Funcionalidade de PDF a ser reimplementada.");
};

/**
 * Página para editar um fechamento de caixa existente.
 * Utiliza o componente FechamentoForm para renderizar e gerenciar o formulário.
 */
export default function EditCashierClosingPage() {
    const router = useRouter();
    const params = useParams();
    const docId = params.id as string; // ID do fechamento a ser editado
    const { toast } = useToast();
    const supabase = createClient();

    const [user, setUser] = React.useState<User | null>(null);
    const [profile, setProfile] = React.useState<FechamentoProfile | null>(null);
    const [authLoading, setAuthLoading] = React.useState(true);
    const [isSaving, setIsSaving] = React.useState(false);
    const [initialLoadingPage, setInitialLoadingPage] = React.useState(true);
    const [fetchedClosingData, setFetchedClosingData] = React.useState<FormInitialData | null>(null);
    
    // Variável para armazenar a data de fechamento original (YYYY-MM-DD) para redirecionamento
    const [originalClosingDateString, setOriginalClosingDateString] = React.useState<string>('');


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
              console.error("Error fetching profile for Edit Page:", profileError.message);
              setProfile(null);
              toast({ variant: "destructive", title: "Erro de Perfil", description: "Não foi possível carregar dados do perfil."});
              router.push('/login');
              setAuthLoading(false);
              return;
            }
            setProfile(profileData as FechamentoProfile | null);

            if (docId && profileData) { // Apenas busca os dados se o perfil estiver carregado
                await fetchExistingClosingData(docId, profileData.loja_id, profileData.admin);
            } else if (!docId) {
                 toast({variant: "destructive", title: "Erro", description: "ID do Fechamento não fornecido."});
                 router.push(profileData?.admin ? '/admin' : '/');
                 setInitialLoadingPage(false);
            }
            // Se docId existe mas profileData não, fetchExistingClosingData lidará com o redirecionamento se necessário

          } else { // No current user
            setProfile(null);
            router.push('/login');
          }
          setAuthLoading(false);
        });

        return () => { authListener.subscription.unsubscribe(); };
      }, [supabase, router, toast, docId]);

    const fetchExistingClosingData = async (documentId: string, userLojaId?: string | null, isAdmin?: boolean | null) => {
        setInitialLoadingPage(true);
        const { data: fechamento, error: fechamentoError } = await supabase
            .from('fechamentos')
            .select(`
                *,
                saidas_operacionais_loja:fechamento_saidas_operacionais(nome, valor, data_pagamento),
                simone_saidas_operacionais:fechamento_simone_saidas_operacionais(nome, valor, data_pagamento)
            `)
            .eq('id', documentId)
            .maybeSingle();

        if (fechamentoError) {
            toast({ variant: "destructive", title: "Erro ao Carregar Fechamento", description: fechamentoError.message });
            router.push(isAdmin ? '/admin' : '/');
            setInitialLoadingPage(false);
            return;
        }
        if (!fechamento) {
            toast({ variant: "destructive", title: "Fechamento Não Encontrado", description: "O registro solicitado não foi encontrado." });
            router.push(isAdmin ? '/admin' : '/');
            setInitialLoadingPage(false);
            return;
        }
        // Verifica permissão para editar
        if (!isAdmin && fechamento.loja_id !== userLojaId) {
             toast({variant: "destructive", title: "Acesso Negado", description: "Você não tem permissão para editar este fechamento."});
             router.push('/'); // Redireciona para a home se não tiver permissão
             setInitialLoadingPage(false);
             return;
        }
        
        // Adapta para FormInitialData (que é a mesma estrutura de FetchedClosingData em FechamentoForm)
        const adaptedData: FormInitialData = {
            id: fechamento.id,
            data_fechamento: fechamento.data_fechamento, // YYYY-MM-DD
            operator_name: fechamento.operator_name,
            user_id: fechamento.user_id, // Não usado diretamente no form, mas pode ser útil
            loja_id: fechamento.loja_id,
            entradas: fechamento.entradas as Record<string, number> || {},
            entradas_eletronicas: fechamento.entradas_eletronicas as { pix: number; cartao: number; deposito: number; } || {pix:0, cartao:0, deposito:0},
            calculated_totals: fechamento.calculated_totals as any, // TODO: Tipar calculated_totals corretamente
            saidas_operacionais_loja: (fechamento.saidas_operacionais_loja || []).map((s: any) => ({ nome: s.nome, valor: s.valor, data_pagamento: s.data_pagamento })),
            simone_saidas_operacionais: (fechamento.simone_saidas_operacionais || []).map((s: any) => ({ nome: s.nome, valor: s.valor, data_pagamento: s.data_pagamento })),
            // Campos de A/R e Recebimentos não são editáveis aqui, mas podem ser carregados se o form precisar exibi-los
            updated_at: fechamento.updated_at, // Para referência, se necessário
        };
        setFetchedClosingData(adaptedData);
        setOriginalClosingDateString(adaptedData.data_fechamento); // Salva a data original para redirecionamento
        setInitialLoadingPage(false);
    };

    /**
     * Função para salvar as alterações de um fechamento existente.
     * Chamada pelo componente FechamentoForm.
     * @param {FechamentoFormData} formData - Dados do formulário.
     */
    const handleUpdateClosing = async (formData: FechamentoFormData) => {
        if (!fetchedClosingData || !user || !profile) {
            toast({ variant: "destructive", title: "Erro", description: "Dados do fechamento ou usuário não carregados.", duration: 3000 }); return;
        }
        setIsSaving(true);
        let hasSubErrors = false;

        const updatedFechamentoCoreData = {
            data_fechamento: formData.data_fechamento, // A data pode ser alterada por um admin
            operator_name: formData.operator_name,
            entradas: formData.entradas,
            entradas_eletronicas: formData.entradas_eletronicas,
            calculated_totals: formData.calculated_totals,
            updated_at: new Date().toISOString()
        };

        // 1. Atualizar o registro principal em 'fechamentos'
        const { error: updateFechamentoError } = await supabase
            .from('fechamentos')
            .update(updatedFechamentoCoreData)
            .eq('id', docId);

        if (updateFechamentoError) {
            toast({ variant: "destructive", title: "Erro ao Atualizar Fechamento", description: updateFechamentoError.message });
            setIsSaving(false); return;
        }

        // 2. Sincronizar saídas operacionais da loja
        const { error: deleteSaidasLojaError } = await supabase.from('fechamento_saidas_operacionais').delete().eq('fechamento_id', docId);
        if (deleteSaidasLojaError) {
            toast({ variant: "destructive", title: "Erro ao Limpar Saídas Antigas (Loja)", description: deleteSaidasLojaError.message, duration: 7000 });
            hasSubErrors = true;
        } else if (formData.saidas_operacionais_loja.length > 0) {
            const saidasLojaToInsert = formData.saidas_operacionais_loja.map(e => ({ fechamento_id: docId, ...e }));
            const { error: insertSaidasLojaError } = await supabase.from('fechamento_saidas_operacionais').insert(saidasLojaToInsert);
            if (insertSaidasLojaError) {
                toast({ variant: "destructive", title: "Erro ao Salvar Novas Saídas (Loja)", description: insertSaidasLojaError.message, duration: 7000 });
                hasSubErrors = true;
            }
        }
        
        // 3. Sincronizar saídas operacionais da Simone (se aplicável)
        if (profile?.admin || profile?.loja_id === 'admin') { // Somente se for Simone/Admin
            const { error: deleteSaidasSimoneError } = await supabase.from('fechamento_simone_saidas_operacionais').delete().eq('fechamento_id', docId);
            if (deleteSaidasSimoneError) {
                toast({ variant: "destructive", title: "Erro ao Limpar Saídas Antigas (Simone)", description: deleteSaidasSimoneError.message, duration: 7000 });
                hasSubErrors = true;
            } else if (formData.simone_saidas_operacionais && formData.simone_saidas_operacionais.length > 0) {
                const saidasSimoneToInsert = formData.simone_saidas_operacionais.map(e => ({ fechamento_id: docId, ...e }));
                const { error: insertSaidasSimoneError } = await supabase.from('fechamento_simone_saidas_operacionais').insert(saidasSimoneToInsert);
                if (insertSaidasSimoneError) {
                    toast({ variant: "destructive", title: "Erro ao Salvar Novas Saídas (Simone)", description: insertSaidasSimoneError.message, duration: 7000 });
                    hasSubErrors = true;
                }
            }
        }
        // Novas A/R e Pagamentos Recebidos não são editados aqui, pois são fixos do fechamento original.

        setIsSaving(false);
        if (hasSubErrors) {
            toast({ title: "Atualização Parcialmente Concluída", description: "Alguns dados podem não ter sido atualizados. Verifique.", duration: 8000 });
        } else {
            toast({ title: "Sucesso!", description: "Fechamento atualizado com sucesso.", duration: 3000 });
        }
        // Redireciona para a página de histórico da data original do fechamento ou para o admin.
        const redirectDate = originalClosingDateString || formData.data_fechamento; // Usa a data original para o path se disponível
        router.push(profile?.admin ? `/admin` : `/historico/${redirectDate}?docId=${docId}&lojaId=${formData.loja_id}`);
        router.refresh(); // Garante que os dados sejam recarregados na página de destino
    };

    if (authLoading || initialLoadingPage || !profile || !user) {
        return (
             <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
                 <Navbar />
                 <main className="flex-grow container mx-auto px-4 md:px-8 py-8 w-full">
                     <div className="w-full max-w-5xl space-y-8 mx-auto">
                         <div className="flex justify-between items-center mb-8"><Skeleton className="h-10 w-2/5 rounded-lg" /><Skeleton className="h-11 w-40 rounded-md" /></div>
                         <Skeleton className="h-24 w-full rounded-xl" />
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

    const displayTitleDate = fetchedClosingData.data_fechamento
        ? formatDateFns(parseDateFns(fetchedClosingData.data_fechamento, 'yyyy-MM-dd', new Date()), 'PPP', { locale: ptBR })
        : "Data Inválida";

    return (
        <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
             <Navbar />
             <main className="flex-grow container mx-auto px-4 md:px-8 py-8 w-full">
                <header className="flex flex-wrap justify-between items-center mb-8 gap-4">
                    <h1 className="text-3xl font-bold text-foreground tracking-tight"> Editar Fechamento - {displayTitleDate} </h1>
                    <Button variant="outline" onClick={() => router.back()} disabled={isSaving} className="gap-2 h-11 shadow-sm hover:shadow-md transition-shadow rounded-lg" size="lg"> <ArrowLeft className="h-4 w-4" /> Voltar </Button>
                </header>
                <FechamentoForm
                    initialData={fetchedClosingData}
                    lojaId={fetchedClosingData.loja_id} // lojaId vem dos dados carregados
                    profile={profile}
                    user={user}
                    onSave={handleUpdateClosing}
                    isSavingGlobal={isSaving}
                    isEditing={true}
                    // pendingReceivablesForStore não é passado aqui, pois não se adicionam novos pagamentos na edição
                />
                <footer className="flex flex-col sm:flex-row justify-end items-center mt-10 pb-4 gap-4">
                    <Button
                        variant="outline"
                        onClick={generatePdfDummy}
                        disabled={isSaving || initialLoadingPage || !fetchedClosingData}
                        className="gap-2 px-6 h-11 text-base shadow-sm hover:shadow-md transition-all rounded-lg border-green-600 text-green-700 hover:bg-green-50 w-full sm:w-auto"
                        size="lg"
                    >
                        <MessageSquare className="h-5 w-5"/> Enviar PDF (WhatsApp)
                    </Button>
                    {/* O botão de salvar principal agora está dentro do FechamentoForm */}
                </footer>
             </main>
        </div>
    );
}
