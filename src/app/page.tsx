
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format, parseISO, isValid as isValidDate } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, PlusCircle, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipProvider } from '@/components/ui/tooltip';
import Navbar from '@/components/navbar';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface Profile {
  loja_id: string | null;
  admin?: boolean | null;
  nome_operador?: string | null;
}

interface ClosingData {
    id: string;
    data_fechamento: string; 
    operator_name?: string | null;
    loja_id: string;
    calculated_totals: {
        totalEntradasBrutas: number;
        totalSaidasGeral: number;
        valorEmEspecieConferencia: number;
    } | null;
}

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [closingsLoading, setClosingsLoading] = React.useState(true);
  const [displayedClosings, setDisplayedClosings] = React.useState<ClosingData[]>([]);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(undefined);
  const [searchActive, setSearchActive] = React.useState(false);
  const [popoverOpen, setPopoverOpen] = React.useState(false);

  React.useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setAuthLoading(true);
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        // console.log(`[DEBUG HomePage] Attempting to fetch profile for user ID: ${currentUser.id}`);
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('loja_id, admin, nome_operador')
          .eq('id', currentUser.id)
          .maybeSingle();

        if (profileError) {
          console.error(`[DEBUG HomePage] Error fetching profile for ${currentUser.id}:`, profileError);
          setProfile(null);
          toast({variant: "destructive", title: "Erro de Conexão com Perfil", description: `Não foi possível buscar o perfil: ${profileError.message}`});
          setClosingsLoading(false);
        } else if (!profileData) {
          // console.warn(`[DEBUG HomePage] Profile not found for user ID: ${currentUser.id}`);
          setProfile(null);
          toast({variant: "destructive", title: "Perfil Não Configurado", description: "Seu perfil de usuário não foi encontrado. Por favor, contate o administrador.", duration: 7000});
          setClosingsLoading(false);
        } else {
          // console.log(`[DEBUG HomePage] Profile fetched successfully for ${currentUser.id}:`, profileData);
          setProfile(profileData);
          if (profileData.admin) {
            router.replace('/admin'); 
          } else if (profileData.loja_id) {
            fetchClosingsFromSupabase(undefined, profileData.loja_id);
          } else { 
            toast({variant: "destructive", title: "Perfil Incompleto", description: "Sua loja não está definida no perfil. Contate o administrador.", duration: 7000});
            setDisplayedClosings([]);
            setClosingsLoading(false);
          }
        }
      } else {
        setProfile(null);
        router.replace('/login');
      }
      setAuthLoading(false);
    });
    
    return () => { authListener.subscription.unsubscribe(); };
  }, [supabase, router, toast]);


  const fetchClosingsFromSupabase = async (date?: Date, userLojaId?: string | null) => {
    if (!userLojaId) { 
        setDisplayedClosings([]);
        setClosingsLoading(false);
        if(!profile?.admin) { 
            // console.warn("[DEBUG HomePage] fetchClosingsFromSupabase called without userLojaId for non-admin.");
        }
        return;
    }
    setClosingsLoading(true);
    // console.log(`[DEBUG HomePage] Fetching closings for loja_id: ${userLojaId}` + (date ? ` and date: ${format(date, 'yyyy-MM-dd')}` : ' (latest 10)'));
    
    let query = supabase
        .from('fechamentos')
        .select('id, data_fechamento, operator_name, loja_id, calculated_totals')
        .order('data_fechamento', { ascending: false });

    if (date) {
        query = query.eq('data_fechamento', format(date, 'yyyy-MM-dd'));
    } else {
        query = query.limit(10); 
    }
    
    query = query.eq('loja_id', userLojaId); 
    
    const { data, error } = await query;

    if (error) {
        console.error("[DEBUG HomePage] Error fetching closings:", error);
        toast({ variant: "destructive", title: "Erro ao Buscar Fechamentos", description: error.message });
        setDisplayedClosings([]);
    } else {
        // console.log("[DEBUG HomePage] Closings fetched:", data);
        setDisplayedClosings(data as ClosingData[] || []);
    }
    setClosingsLoading(false);
    setSearchActive(!!date);
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setPopoverOpen(false);
    if (profile && profile.loja_id && !profile.admin) { 
        fetchClosingsFromSupabase(date, profile.loja_id);
    } else if (profile && profile.admin) {
        // console.warn("[DEBUG HomePage] handleDateSelect called by admin, but admin should be on /admin page.");
    }
  };

  const handleResetSearch = () => {
    setSelectedDate(undefined);
    setSearchActive(false);
    setPopoverOpen(false);
    if (profile && profile.loja_id && !profile.admin) {
        fetchClosingsFromSupabase(undefined, profile.loja_id);
    }
    toast({
        title: "Consulta Limpa",
        description: "Exibindo os últimos fechamentos.",
        duration: 3000,
    });
  };

  const handleGoToNewClosing = () => {
     router.push('/fechamento');
  };

  const formatCurrency = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value) || !isFinite(value)) return 'R$ 0,00';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };


  const closingsCardTitle = searchActive && selectedDate
     ? `Fechamentos de ${format(selectedDate, 'PPP', { locale: ptBR })}`
     : 'Últimos Fechamentos';
  const closingsCardDescription = searchActive
     ? `Exibindo fechamentos para a data selecionada.`
     : 'Resumo dos fechamentos mais recentes.';

  if (authLoading || (!user && !authLoading)) { 
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 md:px-8 py-8 flex items-center justify-center">
                <p>Carregando...</p>
            </main>
        </div>
    );
  }
  
  if (!profile && !authLoading && user) { 
     return (
        <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 md:px-8 py-8 flex items-center justify-center">
                <Card className="shadow-lg border border-border/50 bg-white overflow-hidden rounded-xl p-8 text-center">
                    <CardTitle className="text-xl font-bold text-destructive">Aguardando Dados do Perfil</CardTitle>
                    <CardDescription className="text-muted-foreground mt-2">
                        Verificando configurações do usuário... Se o problema persistir, contate o administrador.
                    </CardDescription>
                </Card>
            </main>
        </div>
    );
  }

  if (profile && !profile.admin && !profile.loja_id) {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 md:px-8 py-8 flex items-center justify-center">
                 <Card className="shadow-lg border border-border/50 bg-white overflow-hidden rounded-xl p-8 text-center">
                    <CardTitle className="text-xl font-bold text-destructive">Configuração de Loja Pendente</CardTitle>
                    <CardDescription className="text-muted-foreground mt-2">
                        Sua loja não está definida no perfil. Por favor, contate o administrador.
                    </CardDescription>
                </Card>
            </main>
        </div>
    );
  }


  return (
    <TooltipProvider>
        <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/30">
          <Navbar />
            <main className="flex-grow container mx-auto px-4 md:px-8 py-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                     <div className="md:col-span-1 space-y-6 sticky top-[calc(var(--navbar-height,64px)+1.5rem)]">
                        <Card className="shadow-lg border border-border/50 bg-white overflow-hidden rounded-xl">
                             <CardHeader className="relative p-6 bg-gradient-to-br from-primary/10 to-secondary/10">
                                <div className="relative z-10">
                                    <CardTitle className="text-xl font-bold text-foreground">Bem-vindo(a)!</CardTitle>
                                    <CardDescription className="text-muted-foreground mt-1">Ações rápidas e consulta de histórico.</CardDescription>
                                </div>
                             </CardHeader>
                            <CardContent className="flex flex-col gap-4 p-6">
                                <Button
                                    size="lg"
                                    onClick={handleGoToNewClosing}
                                    className="w-full justify-start gap-3 shadow-sm hover:shadow-md border border-border/30 transition-all duration-150 hover:bg-primary/90 hover:text-primary-foreground rounded-lg text-base h-11"
                                    aria-label="Iniciar novo fechamento de caixa"
                                    disabled={!profile || (!profile.loja_id && !profile.admin)}
                                >
                                    <PlusCircle className="h-5 w-5" />
                                    Novo Fechamento de Caixa
                                </Button>
                                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            size="lg"
                                            className={cn(
                                              "w-full justify-start text-left font-normal gap-3 transition-all duration-150 rounded-lg h-11 text-base",
                                              !selectedDate && "text-muted-foreground",
                                              "bg-secondary/80 hover:bg-secondary hover:shadow-md shadow-sm border-black/10 text-black"
                                            )}
                                            disabled={!profile || (!profile.loja_id && !profile.admin)}
                                        >
                                            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                                            {selectedDate ? (
                                                format(selectedDate, "PPP", { locale: ptBR })
                                            ) : (
                                                <span>Consultar por Data</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={selectedDate}
                                            onSelect={handleDateSelect}
                                            initialFocus
                                            locale={ptBR}
                                            disabled={(date) => date > new Date() || date < new Date("2024-01-01")}
                                        />
                                    </PopoverContent>
                                </Popover>
                                {searchActive && (
                                     <Button
                                         variant="ghost"
                                         size="sm"
                                         onClick={handleResetSearch}
                                         className="w-full text-muted-foreground hover:text-foreground transition-colors rounded-lg flex items-center justify-center gap-2"
                                         disabled={!profile || (!profile.loja_id && !profile.admin)}
                                     >
                                         <X className="h-4 w-4" /> Limpar Consulta
                                     </Button>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="md:col-span-2">
                        <Card className="shadow-lg border border-border/50 bg-white overflow-hidden rounded-xl">
                             <CardHeader className="relative p-6 bg-gradient-to-br from-muted/10 to-background">
                                <div className="relative z-10">
                                    <CardTitle className="text-xl font-bold text-foreground">
                                       {closingsCardTitle}
                                    </CardTitle>
                                    <CardDescription className="text-muted-foreground mt-1">
                                      {closingsCardDescription}
                                    </CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6">
                                {closingsLoading ? (
                                    <div className="space-y-4">
                                        {[...Array(searchActive ? 1 : 3)].map((_, i) =>
                                             <Skeleton key={i} className="h-20 w-full rounded-xl shadow-sm" />
                                         )}
                                    </div>
                                ) : displayedClosings.length > 0 ? (
                                    <ul className="space-y-4">
                                        {displayedClosings.map((closing) => {
                                            let formattedDateStr = 'Data Inválida';
                                            try {
                                                // Adiciona T00:00:00 para garantir que a data seja interpretada como local/UTC 00:00
                                                const dateObj = parseISO(closing.data_fechamento + 'T00:00:00'); 
                                                if (isValidDate(dateObj)) {
                                                    formattedDateStr = format(dateObj, "PPP", { locale: ptBR });
                                                }
                                            } catch (e) {
                                                console.error("Error parsing date for display:", closing.data_fechamento, e);
                                            }
                                            const totals = closing.calculated_totals;
                                            return (
                                                <li key={closing.id} className="border border-border/40 bg-background p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-muted/40 hover:shadow-md transition-all duration-150">
                                                    <div className="flex-1 min-w-0">
                                                         <Link href={`/historico/${closing.data_fechamento}?docId=${closing.id}&lojaId=${closing.loja_id}`} passHref>
                                                             <span className="font-semibold text-lg text-foreground truncate cursor-pointer hover:underline hover:text-primary block">
                                                                 {formattedDateStr}
                                                             </span>
                                                         </Link>
                                                         {closing.operator_name && (
                                                            <span className="text-xs text-muted-foreground block mt-0.5">(Op: {closing.operator_name})</span>
                                                         )}
                                                        {totals && (
                                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-2">
                                                                <span className="text-success">Entr. Brutas: {formatCurrency(totals.totalEntradasBrutas)}</span>
                                                                <span className="text-destructive">Saídas Gerais: {formatCurrency(totals.totalSaidasGeral)}</span>
                                                                <span className={`font-medium ${totals.valorEmEspecieConferencia >= 0 ? 'text-primary' : 'text-destructive'}`}>Espécie: {formatCurrency(totals.valorEmEspecieConferencia)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="text-center text-muted-foreground py-10 text-lg italic">
                                        {searchActive ? 'Nenhum fechamento para esta data.' : 'Nenhum fechamento encontrado.'}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    </TooltipProvider>
  );
}
