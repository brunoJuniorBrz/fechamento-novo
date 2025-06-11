'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from "@/hooks/use-toast";
import type { User } from '@supabase/supabase-js';

interface Profile {
  loja_id?: string | null;
  nome_operador?: string | null;
  admin?: boolean | null;
}

/**
 * Componente Navbar para a aplicação.
 * Responsável por exibir o logo, navegação básica, informações do usuário logado
 * e opções de login/logout. Interage com o Supabase para obter o estado de autenticação
 * e dados do perfil do usuário.
 */
export function Navbar() {
  const supabase = createClient(); // Cliente Supabase para interações com o backend.
  const router = useRouter(); // Hook do Next.js para navegação programática.
  const pathname = usePathname(); // Hook do Next.js para obter o caminho da rota atual.
  const { toast } = useToast(); // Hook para exibir notificações (toasts).

  // Ref para armazenar o pathname mais recente.
  // Isto é usado no listener de autenticação para evitar dependência direta de `pathname`
  // que poderia causar re-execuções indesejadas do useEffect.
  const pathnameRef = useRef(pathname);

  // Efeito para manter `pathnameRef.current` sincronizado com o `pathname` atual.
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Estado para armazenar o objeto do usuário autenticado do Supabase.
  const [user, setUser] = useState<User | null>(null);
  // Estado para armazenar os dados do perfil do usuário (da tabela 'profiles').
  const [profile, setProfile] = useState<Profile | null>(null);
  // Estado para controlar o feedback visual de carregamento, especialmente durante operações assíncronas como login/logout.
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Busca o perfil detalhado do usuário na tabela 'profiles' do Supabase.
   * Esta função é memoizada com `useCallback` para otimizar performance,
   * evitando recriações em cada renderização do Navbar, a menos que `supabase` ou `toast` mudem.
   * @async
   * @param {string} userId - O ID do usuário (geralmente `auth.user.id`) cujo perfil será buscado.
   * @returns {Promise<Profile | null>} Uma promessa que resolve para o objeto de perfil ou `null`.
   */
  const fetchUserProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    // console.log(`[DEBUG Navbar] Tentando buscar perfil para User ID: ${userId}`);
    const { data: profileData, error: profileError } = await supabase
      .from('profiles') // Tabela de perfis
      .select('loja_id, nome_operador, admin') // Campos selecionados
      .eq('id', userId) // Filtro pelo ID do usuário
      .maybeSingle(); // Retorna um único objeto ou null, sem erro se não encontrado.

    if (profileError) {
      console.error(`[DEBUG Navbar] Erro ao buscar perfil para ${userId}:`, profileError);
      toast({ variant: "destructive", title: "Erro ao buscar perfil", description: "Não foi possível carregar os dados do seu perfil." });
      return null;
    }
    // Não é necessário um `else if (!profileData)` explícito aqui, pois `maybeSingle()` já trata isso.
    // console.log(`[DEBUG Navbar] Perfil buscado para ${userId}:`, profileData);
    return profileData;
  }, [supabase, toast]);

  // Efeito para carregar a sessão e o perfil do usuário na montagem inicial do componente.
  useEffect(() => {
    const handleInitialLoad = async () => {
      setIsLoading(true);
      // Obtém a sessão atual do Supabase.
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;
      setUser(currentUser); // Define o usuário no estado.

      if (currentUser) {
        // Se houver um usuário na sessão, busca seu perfil.
        const fetchedProfile = await fetchUserProfile(currentUser.id);
        setProfile(fetchedProfile);
      } else {
        // Se não houver sessão, garante que o perfil também seja nulo.
        setProfile(null);
      }
      setIsLoading(false); // Finaliza o estado de carregamento.
    };

    handleInitialLoad();
  }, [supabase, fetchUserProfile]); // `fetchUserProfile` é memoizada.

  // Efeito para monitorar mudanças no estado de autenticação (login/logout) e reagir adequadamente.
  useEffect(() => {
    // `onAuthStateChange` retorna um objeto com uma propriedade `subscription`.
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser); // Atualiza o estado do usuário com base na sessão.

      let fetchedProfile: Profile | null = null;
      if (currentUser) {
        // Se um usuário está presente (login ou refresh de sessão), busca/atualiza o perfil.
        fetchedProfile = await fetchUserProfile(currentUser.id);
        setProfile(fetchedProfile);
      } else {
        // Se não há usuário (logout), limpa o perfil.
        setProfile(null);
      }

      // Lógica de redirecionamento pós-login/logout.
      // Utiliza `pathnameRef.current` para evitar dependência direta de `pathname` no array de dependências do useEffect,
      // o que poderia causar loops de re-renderização ou execuções em momentos não ideais.
      if (event === "SIGNED_IN") {
        // Se o usuário fez login e estava na página de login, redireciona.
        if (pathnameRef.current === "/login") {
            if (fetchedProfile?.admin) { // Redireciona admin para /admin.
              router.push('/admin');
            } else { // Redireciona não-admin para a página inicial.
              router.push('/');
            }
        }
      } else if (event === "SIGNED_OUT") {
        // Se o usuário fez logout e não está já na página de login, redireciona para /login.
        if (pathnameRef.current !== "/login") {
            router.push('/login');
        }
      }
    });

    // Função de limpeza: desinscreve o listener de autenticação quando o componente é desmontado.
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [supabase, router, fetchUserProfile]); // `fetchUserProfile` é memoizada.

  /**
   * Realiza o logout do usuário.
   * Atualiza o estado de `isLoading` e exibe notificações de sucesso ou erro.
   * O redirecionamento é tratado pelo listener `onAuthStateChange`.
   */
  const handleLogout = async () => {
    setIsLoading(true); // Indica que uma operação assíncrona está em andamento.
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao Sair",
        description: error.message,
      });
      setIsLoading(false);
    } else {
      toast({ title: 'Logout Realizado', description: 'Você foi desconectado.' });
      // onAuthStateChange cuidará do redirecionamento
    }
  };

  const displayName = profile?.nome_operador || profile?.loja_id || user?.email?.split('@')[0] || 'Usuário';
  const showAuthElements = !isLoading && user && pathname !== '/login';
  const logoLink = profile?.admin ? "/admin" : "/";

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border/60">
      <div className="container mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center">
          <Link href={logoLink} className="flex items-center">
            <Image
              src="/logo-top.png"
              alt="Logo Top Vistorias"
              width={100}
              height={50}
              priority
              className="object-contain"
              data-ai-hint="company logo"
            />
          </Link>
        </div>

        <div className="flex items-center gap-3 text-sm text-foreground">
          {isLoading && pathname !== '/login' && (
            <span className="text-muted-foreground text-xs">Carregando...</span>
          )}
          {showAuthElements && (
            <>
              <span className="text-foreground font-medium hidden sm:inline">{displayName}</span>
              <Button
                onClick={handleLogout}
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-[#f7901e]"
                aria-label="Logout"
                disabled={isLoading}
              >
                <LogOut className="h-5 w-5" />
                <span className="sr-only">Logout</span>
              </Button>
            </>
          )}
          {!isLoading && !user && pathname !== '/login' && (
             <Link href="/login">
               <Button className="bg-[#f7901e] text-white hover:bg-[#e6801e] font-bold">Entrar</Button>
             </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
