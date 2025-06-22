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

export function Navbar() {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  // Ref para armazenar o pathname mais recente
  const pathnameRef = useRef(pathname);

  // Efeito para manter o pathnameRef atualizado
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Memoize the profile fetching logic
  const fetchUserProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    console.log(`[DEBUG Navbar] Attempting to fetch profile for user ID: ${userId}`);
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('loja_id, nome_operador, admin')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error(`[DEBUG Navbar] Error fetching profile for ${userId}:`, profileError);
      return null;
    } else if (!profileData) {
      console.warn(`[DEBUG Navbar] Profile not found for user ID: ${userId}`);
      return null;
    } else {
      console.log(`[DEBUG Navbar] Profile fetched successfully for ${userId}:`, profileData);
      return profileData;
    }
  }, [supabase]);

  // Effect for initial session check and profile fetch
  useEffect(() => {
    const handleInitialLoad = async () => {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        const fetchedProfile = await fetchUserProfile(currentUser.id);
        setProfile(fetchedProfile);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    };

    handleInitialLoad();
  }, [supabase, fetchUserProfile]);

  // Effect for listening to auth state changes and handling redirection
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser); // Update user state
      let currentProfile: Profile | null = null; // Use a local variable for immediate profile data

      if (currentUser) {
        currentProfile = await fetchUserProfile(currentUser.id);
        setProfile(currentProfile);
      } else {
        setProfile(null);
      }

      // Handle redirection based on event and current pathname (via ref)
      if (event === "SIGNED_IN") {
        if (pathnameRef.current === "/login") { // Usando pathnameRef.current
            if (currentProfile?.admin) {
              router.push('/admin');
            } else {
              router.push('/');
            }
        }
      } else if (event === "SIGNED_OUT" && pathnameRef.current !== "/login") { // Usando pathnameRef.current
        router.push('/login');
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [supabase, router, fetchUserProfile]); // Removido pathname das dependências

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
