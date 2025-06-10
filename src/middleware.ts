
import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { createClient } from '@/lib/supabase/middleware'; // Import the client factory

export async function middleware(request: NextRequest) {
  // updateSession vai verificar/atualizar o cookie da sessão do Supabase
  // e retornar a resposta original ou uma nova resposta se o cookie precisar ser definido/atualizado.
  const response = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Use o cliente Supabase específico para middleware para obter o usuário
  // É importante passar request e response para que ele possa ler/escrever cookies.
  const supabase = createClient(request, response);
  const { data: { user } } = await supabase.auth.getUser();

  const publicPaths = ['/login'];
  const adminPath = '/admin';
  const rootPath = '/';

  if (publicPaths.includes(pathname)) {
    // Se o usuário já está logado e tenta acessar /login, redirecione
    if (user && pathname === '/login') {
        // Verifique o perfil para redirecionamento de admin
        const { data: profile } = await supabase
            .from('profiles')
            .select('admin')
            .eq('id', user.id)
            .single();
        
        if (profile?.admin) {
            return NextResponse.redirect(new URL(adminPath, request.url));
        }
        return NextResponse.redirect(new URL(rootPath, request.url));
    }
    return response; // Permite acesso a rotas públicas se não logado
  }

  // Se não há usuário e a rota não é pública, redireciona para /login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (pathname !== rootPath) { // Evita loop se a home for protegida e já estivermos indo para login
      url.searchParams.set('redirectedFrom', pathname);
    }
    return NextResponse.redirect(url);
  }
  
  // Se o usuário está logado e é admin, mas está tentando acessar a home de funcionário,
  // redireciona para /admin. Isso é uma camada extra de segurança.
  if (user && pathname === rootPath) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('admin')
        .eq('id', user.id)
        .single();
    if (profile?.admin) {
        return NextResponse.redirect(new URL(adminPath, request.url));
    }
  }
  
  // Se o usuário está logado, não é admin, mas está tentando acessar /admin,
  // redireciona para a home.
  if (user && pathname === adminPath) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('admin')
        .eq('id', user.id)
        .single();
    if (!profile?.admin) {
        return NextResponse.redirect(new URL(rootPath, request.url));
    }
  }

  return response; // Permite acesso se usuário logado e rota ok
}

export const config = {
  matcher: [
    /*
     * Combine todos os caminhos de solicitação, exceto para os seguintes:
     * - Rotas de API (_next/static (arquivos estáticos))
     * - _next/image (otimização de imagem)
     * - favicon.ico (arquivo de favicon)
     * - logo-top.png
     * O objetivo é executar o middleware em todas as rotas de "página".
     */
    '/((?!api|_next/static|_next/image|favicon.ico|logo-top.png).*)',
  ],
};

    