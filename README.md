# Sistema de Gerenciamento de Fechamentos de Caixa

## Descrição Curta

Este é um sistema web desenvolvido para gerenciar fechamentos de caixa de múltiplas lojas, permitindo o registro detalhado de entradas, saídas, movimentações financeiras e contas a receber. Inclui um painel administrativo para visualização de estatísticas consolidadas, filtros e gerenciamento geral.

## Tecnologias Utilizadas

*   **Next.js**: Framework React para desenvolvimento web moderno, utilizado para a estrutura do frontend, roteamento, e renderização (SSR/SSG).
*   **Supabase**: Plataforma Backend-as-a-Service (BaaS) utilizada para:
    *   Autenticação de usuários.
    *   Banco de Dados PostgreSQL para armazenamento de todos os dados da aplicação.
    *   (Supabase Storage pode ser utilizado para armazenamento de arquivos, se necessário no futuro).
*   **TypeScript**: Superset do JavaScript que adiciona tipagem estática, melhorando a robustez e manutenibilidade do código.
*   **Tailwind CSS**: Framework CSS utility-first para estilização rápida e customizável da interface.
*   **Shadcn/ui**: Coleção de componentes de UI reutilizáveis, construídos sobre Tailwind CSS e Radix UI, para uma interface de usuário consistente e moderna. (Inferido pela estrutura de `src/components/ui` e `components.json`).
*   **Genkit com Google AI**: Configurado para futuras funcionalidades de Inteligência Artificial (utilizando o modelo Gemini do Google). Atualmente, esta funcionalidade está apenas configurada e não integrada ao fluxo principal da aplicação.

## Funcionalidades Principais

*   Autenticação de usuários com e-mail e senha.
*   Criação e edição de registros de fechamento de caixa por loja.
*   Registro detalhado de:
    *   Entradas comuns (serviços, produtos).
    *   Entradas eletrônicas (Pix, Cartão, Depósito).
    *   Saídas operacionais (despesas da loja).
    *   Saídas operacionais específicas da administração ("Simone").
*   Gerenciamento de Contas a Receber:
    *   Criação de novas contas a receber durante o fechamento.
    *   Registro de pagamentos recebidos de contas pendentes.
*   Histórico detalhado de fechamentos.
*   Painel de Administração com:
    *   Visão geral de estatísticas financeiras agregadas.
    *   Filtros por período (data) e por loja.
    *   Gráficos de pizza resumindo a composição das finanças.
    *   Lista de todos os fechamentos (com paginação).
    *   Lista de contas a receber com filtros por loja e status (com paginação).
    *   Funcionalidade para dar baixa em contas a receber.

## Pré-requisitos

*   Node.js (recomendado v18.x ou superior)
*   npm (geralmente vem com Node.js) ou yarn

## Configuração do Ambiente

1.  **Clonar o repositório**:
    ```bash
    git clone <URL_DO_REPOSITORIO>
    ```
2.  **Navegar para o diretório do projeto**:
    ```bash
    cd <NOME_DO_DIRETORIO_DO_PROJETO>
    ```
3.  **Instalar dependências**:
    ```bash
    npm install
    ```
    ou, se estiver usando yarn:
    ```bash
    yarn install
    ```
4.  **Configurar Variáveis de Ambiente**:
    *   Crie um arquivo chamado `.env.local` na raiz do projeto.
    *   Adicione as seguintes variáveis de ambiente ao arquivo, substituindo os valores pelos do seu projeto Supabase:

        ```env
        NEXT_PUBLIC_SUPABASE_URL="SUA_URL_DO_PROJETO_SUPABASE"
        NEXT_PUBLIC_SUPABASE_ANON_KEY="SUA_CHAVE_ANONIMA_PUBLICA_SUPABASE"
        ```
    *   **Opcional (para funcionalidades de IA futuras)**:
        ```env
        GOOGLE_GENAI_API_KEY="SUA_CHAVE_DE_API_DO_GOOGLE_GENAI"
        ```

    *   `NEXT_PUBLIC_SUPABASE_URL`: A URL do seu projeto Supabase, encontrada nas configurações do projeto no painel do Supabase.
    *   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: A chave anônima (public) do seu projeto Supabase, também encontrada nas configurações do projeto. Esta chave é segura para ser exposta no lado do cliente, pois depende das políticas de Row Level Security (RLS) do seu banco de dados para proteção de dados.
    *   `GOOGLE_GENAI_API_KEY`: Se você planeja desenvolver ou testar as funcionalidades de IA com Genkit e Google AI, adicione sua chave de API aqui.

## Como Rodar o Projeto

1.  **Modo de Desenvolvimento**:
    ```bash
    npm run dev
    ```
    ou
    ```bash
    yarn dev
    ```
2.  Abra seu navegador e acesse: `http://localhost:3000` (ou a porta indicada no terminal, caso a 3000 esteja em uso).

## Estrutura do Projeto (Visão Geral)

*   `src/app/`: Contém as páginas e o roteamento principal da aplicação Next.js (App Router).
*   `src/components/`: Componentes React reutilizáveis utilizados em várias partes da aplicação.
    *   `src/components/ui/`: Componentes de UI base (provavelmente de Shadcn/ui).
    *   `src/components/fechamento/`: Componentes específicos para os formulários de fechamento.
*   `src/lib/`: Funções utilitárias (`utils.ts`), configuração do cliente Supabase (`supabase/`), e outros módulos de lógica de negócios.
*   `src/ai/`: Configuração do Genkit e futuras implementações de IA.
*   `public/`: Arquivos estáticos, como imagens (ex: `logo-top.png`).

## Observações

*   O arquivo `docs/blueprint.md` encontra-se desatualizado e não reflete a arquitetura atual do sistema (que utiliza Supabase, e não Firebase como descrito no blueprint). Portanto, não deve ser usado como referência para a estrutura ou tecnologias atuais.
*   As funcionalidades de IA com Genkit e Google AI estão configuradas na base do projeto (`src/ai/`) mas ainda não foram implementadas ou integradas nas funcionalidades principais da aplicação.
*   Certifique-se de que as políticas de Row Level Security (RLS) no Supabase estejam devidamente configuradas para garantir a segurança e o isolamento dos dados por loja/usuário.
