
'use client';

import * as React from 'react';
import Image from 'next/image';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from "@/hooks/use-toast";
import { createClient } from '@/lib/supabase/client';

const loginSchema = z.object({
  email: z.string().email({ message: 'Endereço de email inválido.' }),
  // Removida a validação de tamanho mínimo da senha
  password: z.string().nonempty({ message: 'A senha não pode ser vazia.' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const supabase = createClient();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (formData: LoginFormValues) => {
    setIsLoading(true);
    toast({ title: 'Tentando fazer login...', description: 'Por favor, aguarde.' });
    console.log('[DEBUG LoginPage] Attempting login with email:', formData.email);

    // Log ENV VARS for debugging purposes
    console.log('[DEBUG LoginPage] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? "Set" : "NOT SET OR EMPTY");
    console.log('[DEBUG LoginPage] NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "Set" : "NOT SET OR EMPTY");
    console.log('[DEBUG LoginPage] Supabase client instance for auth:', supabase);


    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    });

    if (authError) {
      console.error('[DEBUG LoginPage] Supabase Auth Error:', authError);
      toast({
        variant: "destructive",
        title: "Falha na Autenticação",
        description: authError.message || "Ocorreu um erro ao tentar fazer login. Verifique suas credenciais.",
        duration: 7000,
      });
      setIsLoading(false);
      return;
    }

    if (!authData.user) {
      console.error('[DEBUG LoginPage] No user data returned after signInWithPassword despite no error. Auth Data:', authData);
      toast({
        variant: "destructive",
        title: "Erro de Autenticação Inesperado",
        description: "Usuário não autenticado após o login, mesmo sem erro explícito. Tente novamente ou contate o suporte.",
        duration: 7000,
      });
      setIsLoading(false);
      return;
    }
    
    const currentUserID = authData.user.id;
    console.log(`[DEBUG LoginPage] Login successful for user ID: ${currentUserID}. Fetching profile...`);
    
    let profileData = null;
    let profileFetchError: any = null;

    try {
      console.log(`[DEBUG LoginPage] Attempting to fetch profile using .single() for user ID: ${currentUserID}`);
      console.log('[DEBUG LoginPage] Supabase client instance for profile fetch:', supabase);

      const { data: pData, error: pError } = await supabase
        .from('profiles')
        .select('id, admin, loja_id, nome_operador') // Requesting all necessary fields
        .eq('id', currentUserID) // Filtering by the 'id' column which corresponds to the user's UUID
        .single(); // .single() expects exactly one row or returns an error in pError.

      console.log('[DEBUG LoginPage] Profile data from Supabase (pData):', pData);
      console.log('[DEBUG LoginPage] Profile error from Supabase (pError):', pError); // THIS IS A CRUCIAL LOG

      if (pError) {
        profileFetchError = pError;
      } else if (!pData) {
        // This case should ideally be handled by pError from .single() if no row is found (PGRST116).
        // If it's reached, it means .single() didn't error but returned no data.
        profileFetchError = { message: "Perfil não encontrado na base de dados (pData nulo, sem pError)." };
        console.warn(`[DEBUG LoginPage] Profile data (pData) is null/undefined for ${currentUserID}, and pError was also null/undefined. This is unexpected with .single() if the row doesn't exist.`);
      } else {
        profileData = pData;
      }
    } catch (e: any) {
      // This catch block is for unexpected errors during the Supabase call itself (e.g. network issues, SDK bugs)
      console.error(`[DEBUG LoginPage] EXCEPTION during profile fetch for ${currentUserID}:`, e);
      profileFetchError = e; // Assign the caught exception
    }

    if (profileFetchError) {
      console.error(`[DEBUG LoginPage] Error fetching profile for ${currentUserID} (profileFetchError):`, profileFetchError);
      
      let errorDescription = "Ocorreu um erro ao buscar dados do perfil. Verifique RLS e se o perfil existe.";
      if (profileFetchError.message) {
        errorDescription = profileFetchError.message;
      } else if (typeof profileFetchError === 'object' && profileFetchError !== null && Object.keys(profileFetchError).length === 0 && profileFetchError.constructor === Object) {
        // Handle the specific case where profileFetchError is {}
        errorDescription = "Erro ao buscar perfil: Recebido um objeto de erro vazio do Supabase. Isso pode indicar um problema com RLS, que o perfil não existe, ou um erro inesperado na resposta. Verifique o log 'pError' no console do navegador para mais detalhes.";
      } else if (typeof profileFetchError === 'string') {
        errorDescription = profileFetchError;
      }
      
      toast({
        variant: "destructive",
        title: "Erro ao Buscar Perfil do Usuário",
        description: errorDescription,
        duration: 7000,
      });
      profileData = null; // Ensure profileData is null if there was an error
    }
    
    if (profileData) {
      console.log(`[DEBUG LoginPage] Profile fetched successfully for ${currentUserID}:`, profileData);
      toast({
        title: "Login bem-sucedido!",
        description: `Bem-vindo(a), ${profileData?.nome_operador || formData.email}! Carregando dados...`,
        duration: 3000,
      });

      await new Promise(resolve => setTimeout(resolve, 500)); // Give toast time to show

      if (profileData?.admin) {
        console.log('[DEBUG LoginPage] Admin user. Redirecting to /admin');
        router.push('/admin');
      } else {
        console.log('[DEBUG LoginPage] Non-admin user. Redirecting to /');
        router.push('/');
      }
      router.refresh(); 
    } else if (!profileFetchError) {
        // This case means profileData is null, but there was no profileFetchError recorded.
        // This implies the `else if (!pData)` block inside the try was hit, or initial profileData remained null.
        console.warn(`[DEBUG LoginPage] Profile not found for user ID: ${currentUserID} (no error, but profileData is null). This usually means the trigger to create a profile might have failed or the profile was deleted.`);
        toast({
            variant: "destructive",
            title: "Perfil de Usuário Não Encontrado",
            description: "Seu perfil de usuário não foi encontrado ou está incompleto. Por favor, contate o administrador para configurar sua loja e permissões.",
            duration: 7000,
        });
    }
    // If profileFetchError was true, the error toast has already been shown.
    // The existing logic handles profileData being null for redirection.

    setIsLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#044466' }}>
      <Card className="bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md mx-4 border border-gray-200">
          <CardHeader className="p-0 mb-6 text-center">
              <div className="flex justify-center mb-4">
                  <div className="relative w-[180px] h-[90px] sm:w-[200px] sm:h-[100px]">
                      <Image
                          src="/logo-top.png"
                          alt="Logo Top Vistorias"
                          fill
                          priority
                          sizes="(max-width: 640px) 180px, 200px"
                          style={{ objectFit: "contain" }}
                          data-ai-hint="company logo"
                      />
                  </div>
              </div>
              <h1 className="text-2xl sm:text-3xl text-[#044466] font-bold tracking-tight">
                  TOP VISTORIAS
              </h1>
              <p className="text-sm text-gray-500 mt-1">Acesso ao Sistema de Caixa</p>
          </CardHeader>
          <CardContent className="p-0">
              <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                              <FormItem>
                                  <FormControl>
                                      <Input
                                          id="email"
                                          type="email"
                                          placeholder="Email"
                                          required
                                          disabled={isLoading}
                                          className="h-11 pl-3 pr-3 w-full border border-gray-300 rounded-md focus:ring-[#f7901e] focus:border-[#f7901e] transition duration-150 ease-in-out text-base"
                                          {...field}
                                      />
                                  </FormControl>
                                  <FormMessage className="text-red-500 text-xs pt-1" />
                              </FormItem>
                          )}
                      />
                      <FormField
                          control={form.control}
                          name="password"
                          render={({ field }) => (
                              <FormItem>
                                  <FormControl>
                                      <Input
                                          id="password"
                                          type="password"
                                          placeholder="Senha"
                                          required
                                          disabled={isLoading}
                                          className="h-11 pl-3 pr-3 w-full border border-gray-300 rounded-md focus:ring-[#f7901e] focus:border-[#f7901e] transition duration-150 ease-in-out text-base"
                                          {...field}
                                      />
                                  </FormControl>
                                  <FormMessage className="text-red-500 text-xs pt-1" />
                              </FormItem>
                          )}
                      />
                      <Button
                         type="submit"
                         className="w-full bg-[#f7901e] text-white h-11 hover:bg-[#e6801e] font-bold rounded-md transition duration-150 ease-in-out text-base shadow-md hover:shadow-lg"
                         disabled={isLoading}
                      >
                          {isLoading ? (
                              <div className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Entrando...
                              </div>
                          ) : (
                            'Entrar'
                          )}
                      </Button>
                  </form>
              </Form>
          </CardContent>
      </Card>
    </div>
  );
}
