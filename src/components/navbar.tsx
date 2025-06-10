
'use client';

import React, { useEffect, useState } from 'react';
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

export function Navbar() {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUserAndProfile = async (currentUser: User | null) => {
      setUser(currentUser);
      if (currentUser) {
        console.log(`[DEBUG Navbar] Attempting to fetch profile for user ID: ${currentUser.id}`);
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('loja_id, nome_operador, admin')
          .eq('id', currentUser.id)
          .maybeSingle(); 

        if (profileError) {
          console.error(`[DEBUG Navbar] Error fetching profile for ${currentUser.id}:`, profileError);
          setProfile(null); 
          // Não mostrar toast aqui para evitar poluir, a menos que seja crítico.
          // As páginas lidarão com toasts de perfil não encontrado.
        } else if (!profileData) {
          console.warn(`[DEBUG Navbar] Profile not found for user ID: ${currentUser.id}`);
          setProfile(null);
        } else {
          console.log(`[DEBUG Navbar] Profile fetched successfully for ${currentUser.id}:`, profileData);
          setProfile(profileData);
        }
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    };

    // Busca inicial da sessão
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchUserAndProfile(session?.user ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setIsLoading(true); // Define loading true no início de cada mudança de estado de auth
      const currentUser = session?.user ?? null;
      await fetchUserAndProfile(currentUser); 

      if (event === "SIGNED_IN") {
        if (pathname === "/login") { 
            // profile state já foi atualizado por fetchUserAndProfile
            if (profile?.admin) { // Usa o estado do perfil atualizado
              router.push('/admin');
            } else {
              router.push('/');
            }
            router.refresh();
        }
      } else if (event === "SIGNED_OUT" && pathname !== "/login") {
        router.push('/login');
        router.refresh(); 
      }
      // setIsLoading(false); // Movido para dentro de fetchUserAndProfile
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [supabase, router, pathname, profile?.admin]); // Adicionado profile.admin aqui para reavaliar o redirecionamento na navbar

  const handleLogout = async () => {
    setIsLoading(true); 
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
