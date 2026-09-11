# Connecta AI — Instruções Operacionais para Agentes (AGENTS.md)

Este documento define as diretrizes de engenharia, arquitetura de software, catálogo de **29 Skills** gerenciadas e convenções operacionais estritas para agentes e assistentes de IA (Google Antigravity, OpenAI Codex, Claude Code, Gemini CLI, Cursor, Windsurf) trabalhando no repositório **Connecta AI (INTEGRAÇÃO CONTAS A PAGAR, RECEBER E VENDAS)**.

---

## 1. Visão Geral e Missão do Projeto

O **Connecta AI** é uma plataforma SaaS corporativa multi-tenant de automação contábil, financeira e fiscal que integra ERPs de mercado (**Conta Azul API v2**), sistemas de gestão de concessionárias e oficinas (**Datacar DMS**), o **Emissor Nacional Gov.br** (NFS-e padrão nacional via DPS) e a **SEFAZ** (NF-e de produtos e DANFE).

### 🏛️ Módulos Centrais da Aplicação:

1. **Gestão de Pagamentos & Contas a Pagar** (`/contas-pagar`, `/gestao-pagamentos`):
   - Importação e processamento de planilhas financeiras e relatórios bancários.
   - Motor inteligente de categorização e **De-Para de Fornecedores** com regras persistidas no banco.
   - Semáforo de consistência (Verde: mapeado e pronto, Amarelo: parcial, Vermelho: fornecedor novo/não cadastrado).
   - Agendamento de lotes e exportação sincronizada para o Conta Azul.

2. **Vendas de Peças & Produtos (NF-e)** (`/vendas`):
   - Sincronização direta com a API do **Datacar DMS** e importação de planilhas de OS.
   - Envio e faturamento em lote para o Conta Azul (geração de pedidos e NF-e).
   - Histórico em tempo real de notas emitidas com **Painel de 4 KPIs** (Canceladas, Pendentes, Emitidas, Total do Período).
   - **Visualizador e Gerador de DANFE oficial em PDF** (`/api/notas-emitidas/danfe`) com código de barras Code 128C SVG e download de XML.
   - Motor de fatiamento automático de requisições de até 15 dias para o Conta Azul.

3. **Vendas de Serviços & NFS-e Gov.br** (`/vendas-servicos`):
   - Geração de DPS (Declaração de Prestação de Serviços) conforme layout nacional da Receita Federal.
   - Assinatura digital XML com certificado A1 (`node-forge`, `xml-crypto`).
   - Transmissão assíncrona, consulta de lote e cancelamento de NFS-e.

4. **Conexão OAuth 2.0 & Multi-Tenant** (`/conectar`, `/empresas`):
   - Gestão de tokens OAuth 2.0 segregados por escopo (`vendas` e `financeiro`).
   - **Token Manager Automático** (`src/lib/conta-azul/token-manager.ts`) com auto-refresh transparente antes do vencimento.

---

## 2. Estrutura e Arquitetura do Repositório

```
src/
├── app/                                 # Next.js 14 App Router
│   ├── (dashboard)/                     # Layout autenticado do Dashboard
│   │   ├── contas-pagar/                # Módulo de Contas a Pagar
│   │   ├── gestao-pagamentos/           # Agendamentos e Gestão por Grupo
│   │   ├── vendas/                      # Vendas de Produtos (Datacar + NF-e Conta Azul)
│   │   ├── vendas-servicos/             # Vendas de Serviços (Gov.br NFS-e)
│   │   ├── notas-emitidas/              # Painel Unificado de Notas Fiscais
│   │   ├── conectar/                    # Conexão OAuth Conta Azul
│   │   └── empresas/                    # Cadastro Multi-Empresas e De-Para
│   ├── api/                             # Endpoints Backend Serverless
│   │   ├── conta-azul/                  # APIs de autenticação, vendas, categorias e fornecedores
│   │   ├── datacar/                     # Integração com API Datacar DMS
│   │   ├── gov-br/                      # Emissão e sincronização NFS-e Gov.br
│   │   ├── notas-emitidas/              # Listagem de notas, XML oficial e renderizador DANFE/PDF
│   │   └── fornecedor-depara/           # Motor de regras De-Para de fornecedores
├── components/                          # Design System & Componentes Reutilizáveis
│   ├── layout/                          # Sidebar, Header, SelectorEmpresa
│   ├── upload/                          # DropZones, Modais de Edição e Pré-visualização
│   └── agendamento/                     # Painel de Lotes e Agendamentos
├── lib/                                 # Bibliotecas Internas e Clientes
│   ├── conta-azul/                      # API Client v2 e Token Manager
│   ├── supabase/                        # Clientes Supabase (Client, Server, Admin)
│   └── parsers/                         # Parsers de PDF, Excel (ExcelJS/XLSX) e XML (fast-xml-parser)
└── types/                               # Tipagens TypeScript Universais
```

---

## 3. Principais Skills & Catálogo das 29 Skills Gerenciadas

### 🌟 Principais Skills (Núcleo Operacional do Projeto)

Utilize as Skills adequadas de acordo com a fase de desenvolvimento e o escopo da funcionalidade:

#### 🧭 Navegação, Diagnóstico e Raciocínio
- **`graphify`**: Mapeamento de fluxo de dados entre Datacar, Supabase, Conta Azul e Gov.br antes de refatorações.
- **`diagnosing-bugs`**: Skill primária para investigar falhas em APIs externas, erros de rate limit, formatação de datas ou autenticação OAuth.
- **`systematic-debugging`**: Isolamento de causa raiz com testes determinísticos antes de qualquer edição de código.
- **`context-engineering`**: Manutenção de contexto enxuto e foco cirúrgico no módulo em desenvolvimento.

#### ⚙️ Arquitetura, Backend e Banco de Dados
- **`codebase-design`**: Criação de novas rotas, handlers, isolamento de regras de negócio e tipagem estrita TypeScript.
- **`supabase` & `supabase-postgres-best-practices`**: Modelagem de tabelas relacionais (`empresas`, `vendas_importadas`, `fornecedor_depara`), migrations SQL, políticas RLS e queries performáticas.
- **`security-best-practices` & `cybersecurity-review`**: Proteção de tokens de acesso, chaves de API, certificados digitais A1 e sanitização de payloads fiscais.

#### 🎨 Interface, Experiência do Usuário (UI/UX) e Frontend
- **`vercel-react-best-practices`**: Otimização de renderização, Server Actions, Server Components e hooks do Next.js 14.
- **`ui-ux-pro-max` & `frontend-design`**: Criação de interfaces de alto padrão com tema Dark Fintech, feedback tátil, badges de status, micro-animações e densidade ótima de informação.
- **`impeccable`**: Polimento visual, alinhamento tabular de valores monetários (`R$`), datas em formato brasileiro (`DD/MM/AAAA`) e tipografia monoespaçada em códigos e chaves de acesso.

#### 🛡️ Validação, Revisão e Qualidade
- **`verification-before-completion`**: **MANDATÓRIO.** Nenhum trabalho pode ser dado como concluído sem compilação completa (`npm run build`) e testes práticos dos endpoints.
- **`code-review`**: Revisão sistemática do diff garantindo conformidade com os padrões do projeto e ausência de regressões.

---

### 📚 Catálogo Completo das 29 Skills Disponíveis

1. **`context-engineering`**: Curadoria de contexto enxuto, Progressive Disclosure e foco de atenção.
2. **`prompt-master`**: Engenharia e calibração sistemática de prompts para modelos de linguagem.
3. **`systematic-debugging`**: Investigação metódica de causa raiz antes de alterações aleatórias.
4. **`diagnosing-bugs`**: Diagnóstico avançado e isolamento de bugs complexos e regressões.
5. **`verification-before-completion`**: Protocolo rígido de validação com evidências reais antes de concluir tarefas.
6. **`caveman`**: Modo ultra-conciso de comunicação para economia de tokens.
7. **`codebase-design`**: Arquitetura de módulos profundos, desacoplamento e testabilidade.
8. **`improve-codebase-architecture`**: Refatoração estrutural de sistemas e eliminação de acoplamentos.
9. **`domain-modeling`**: Modelagem de domínio financeiro/fiscal, taxonomia de entidades e schemas.
10. **`code-review`**: Revisão sistemática em dois eixos (padrões de repositório e atendimento de requisitos).
11. **`devils-advocate`**: Desafio de premissas, testes pré-mortem e identificação de pontos cegos.
12. **`resolving-merge-conflicts`**: Resolução orientada de conflitos em git merge e rebase.
13. **`calm`**: Coding Agent Liveness Map (análise de impacto de diffs e call graph).
14. **`graphify`**: Análise gráfica estrutural de dependências e comunidades de código.
15. **`ui-ux-pro-max`**: Design system, paletas, tipografia e diretrizes de usabilidade para aplicações corporativas.
16. **`frontend-design`**: Criação de interfaces ricas, esteticamente sofisticadas e micro-animações.
17. **`impeccable`**: Polimento visual obsessivo, hierarquia, espaçamento e fluidez de interface.
18. **`web-design-guidelines`**: Auditoria contra padrões web de UX, acessibilidade e contraste.
19. **`vercel-react-best-practices`**: Otimização de performance para React, Server Components e Next.js.
20. **`supabase`**: Integração de Database, Auth, Storage, Edge Functions e Realtime no Supabase.
21. **`supabase-postgres-best-practices`**: Modelagem Postgres, RLS seguro, migrations e índices eficientes.
22. **`finding-google-skills`**: Busca sob demanda de skills para Google Cloud, Firebase e APIs Google.
23. **`security-best-practices`**: Práticas de código seguro por padrão em TypeScript e APIs fiscais.
24. **`cybersecurity-review`**: Revisão de segurança de código em 9 dimensões críticas.
25. **`security-threat-model`**: Modelagem de ameaças, trust boundaries e superfícies de ataque.
26. **`security-review`**: Orquestrador de auditoria de dependências, CVEs e scanners estáticos.
27. **`skill-security-review`**: Auditoria prévia obrigatória para instalação de novas skills de terceiros.
28. **`review-skills`**: Auditoria de integridade, ausência de duplicatas e dependências órfãs de skills.
29. **`playwright`**: Automação e testes de browser real via CLI para validação E2E.

---

## 4. Comandos Principais de Desenvolvimento & Testes

```powershell
# Executar o servidor de desenvolvimento local
npm run dev

# Validar compilação de produção e checagem estrita de tipos TypeScript (Obrigatório antes de commits)
cmd.exe /c "npm run build"

# Executar linter
npm run lint

# Scripts de diagnóstico e testes de integração de APIs
node scratch/test_chunked_fetch.js
node scratch/test_xml_danfe_parser.js
```

---

## 5. Regras Operacionais Estritas para Agentes

1. **Comunicação Obrigatória em Português BR**:
   - Todas as respostas, explicações, planos de ação e documentações geradas devem ser estritamente em **Português do Brasil**.

2. **Extrema Cautela & Não-Regressão**:
   - **NUNCA** quebre fluxos de módulos existentes (Contas a Pagar, Vendas Datacar, Gov.br ou Conta Azul).
   - Ao alterar um componente compartilhado, verifique todas as páginas dependentes.

3. **Validação e Build Obrigatório**:
   - Após qualquer alteração de código ou criação de endpoints, execute a validação de compilação (`cmd.exe /c "npm run build"`) para comprovar ausência de erros antes de reportar a conclusão ao usuário.

4. **Padrões de Formatação Visual**:
   - Datas na interface e relatórios devem ser sempre exibidas no padrão brasileiro **`DD/MM/AAAA`** (ou `DD/MM/AAAA HH:mm`).
   - Valores monetários devem ser formatados como moeda brasileira (**`R$ 1.234,56`**).

5. **Respeito às Limitações das APIs Fiscais**:
   - A API de Notas Fiscais do Conta Azul limita o período de consulta a no máximo **15 dias** por requisição. Sempre utilize a rotina de fatiamento automático de intervalos para consultas mensais ou anuais.
