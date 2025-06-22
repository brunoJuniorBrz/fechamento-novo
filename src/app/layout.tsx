
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Top Vistorias - Fechamento de Caixa',
  description: 'Aplicação para controle de fechamento de caixa',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} font-sans antialiased`}>
        <main className="flex-grow">
          {children}
        </main>
        <Toaster />
        <footer className="bg-muted/50 py-3 border-t border-border/60 mt-auto text-center text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Fechamento de Caixa App.</p>
          <p className="mt-1 opacity-75">Desenvolvido por Bruno Gonçalves</p>
        </footer>
      </body>
    </html>
  );
}
