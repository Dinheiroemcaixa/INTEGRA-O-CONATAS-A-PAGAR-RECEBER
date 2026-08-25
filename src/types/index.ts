export type StatusIntegracao = 'pendente' | 'enviado' | 'erro'

export interface Empresa {
  id: string
  nome: string
  cnpj: string
  access_token_conta_azul: string | null
  refresh_token_conta_azul: string | null
  data_expiracao_token: string | null
  conta_azul_connected: boolean
  created_at: string
  /** E-mail de login vinculado a esta empresa no Conta Azul Financeiro */
  email_login: string | null
  /** E-mail de login vinculado a esta empresa no Conta Azul Vendas */
  email_login_vendas?: string | null
  /** Tokens de conexão específicos do Conta Azul Vendas / NFe */
  access_token_conta_azul_vendas?: string | null
  refresh_token_conta_azul_vendas?: string | null
  data_expiracao_token_vendas?: string | null
  conta_azul_vendas_connected?: boolean
  /** Marca se esta empresa é optante do Simples Nacional e emite NFS-e */
  emite_nfse?: boolean
  optante_simples?: boolean
  /** Tipo da empresa: vendas, financeiro (contas a pagar/receber) ou ambos */
  tipo_empresa: 'vendas' | 'financeiro' | 'ambos'
  /** Token de acesso à API do Datacar */
  datacar_token?: string | null
  /** Código da empresa no Datacar */
  datacar_cod_emp?: string | null
  /** ID do operador no Datacar */
  datacar_id_operador?: string | null
  /** Razão Social obtida via Brasil API */
  razao_social?: string | null
  /** Nome Fantasia obtido via Brasil API */
  nome_fantasia?: string | null
  /** Grupo (Gestão de Pagamentos) ao qual esta loja pertence, se houver */
  grupo_id?: string | null
  /** Saldo em caixa desta loja (valor real informado manualmente pelo operador) */
  saldo_caixa?: number | null
  /** Quando a loja foi colocada neste grupo */
  grupo_adicionado_em?: string | null
}

export interface Grupo {
  id: string
  nome: string
  created_at: string
  updated_at: string
}


export interface UsuarioEmpresa {
  id: string
  user_id: string
  empresa_id: string
  empresa?: Empresa
}

export interface ContaPagarImportada {
  id: string
  empresa_id: string
  fornecedor: string
  valor: number
  vencimento: string
  categoria: string | null
  conta_financeira: string | null
  descricao: string | null
  doc: string | null
  emissao: string | null
  status: StatusIntegracao
  conta_azul_id: string | null
  erro_mensagem: string | null
  tentativas: number
  importacao_id: string | null
  created_at: string
  updated_at: string
}

export interface LogIntegracao {
  id: string
  empresa_id: string
  conta_pagar_id: string | null
  acao: string
  status: 'sucesso' | 'erro'
  detalhes: Record<string, unknown> | null
  created_at: string
}

export interface MatchFornecedorInfo {
  nomeOriginal: string
  nomeCorrigido: string
  cnpj: string
  categoria?: string
  confianca: 'exato' | 'alto' | 'medio' | 'baixo' | 'nenhum'
  score: number
}

export interface ContaPagarPreview {
  fornecedor: string
  valor: number
  vencimento: string
  categoria?: string
  conta_financeira?: string
  conta_financeira_id?: string
  descricao?: string
  /** Número do documento / NF original do Datacar */
  doc?: string
  /** Data de emissão do documento */
  emissao?: string
  linha_original?: string
  valido: boolean
  erros?: string[]
  /** Resultado do match automático com fornecedores do ContaAzul */
  matchFornecedor?: MatchFornecedorInfo
  /** Campos originais do Datacar (usados internamente para match, etc) */
  _datacar?: {
    cnpjEmit?: string | null
    razaoSocialBrasilAPI?: string | null
    [key: string]: any
  }
  /** Status de duplicidade encontrada no Conta Azul */
  ca_duplicidade?: {
    encontrado: boolean
    id_conta?: string
    vencimento?: string
    valor?: number
    fornecedor?: string
    status?: string
    detalhes?: string
  }
}

export interface ResultadoImportacao {
  total: number
  validos: number
  invalidos: number
  dados: ContaPagarPreview[]
  aviso?: string
}

export interface VendaItemPreview {
  codigo: string
  descricao: string
  quantidade: number
  /** Valor unitário com desconto aplicado (usado para envio) */
  valor_unitario: number
  
  // Campos extras apenas para visualização na UI:
  tipo?: string
  valor_unitario_original?: number
  desconto?: number
  valor_total?: number
  
  // Metadados do Produto para Conta Azul
  ncm?: string
  origem?: string
  cest?: string
  unidade_medida?: string
  tipo_produto?: string
}

export interface VendaPreview {
  cliente: string
  cliente_cpf_cnpj?: string
  cliente_endereco?: {
    logradouro?: string
    numero?: string
    complemento?: string
    bairro?: string
    cidade?: string
    estado?: string
    cep?: string
  }
  os_numero: string
  data_venda: string
  valor_total: number
  forma_pagamento?: string
  itens: VendaItemPreview[]
  valido: boolean
  erros?: string[]
  /** Status de duplicidade no Conta Azul */
  ca_status?: 'nao_enviado' | 'enviado_sem_nota' | 'enviado_com_nota'
  /** Número da NFe emitida no CA (se houver) */
  ca_nfe_numero?: string
}

export interface ResultadoImportacaoVendas {
  total: number
  validos: number
  invalidos: number
  dados: VendaPreview[]
  aviso?: string
}

export interface VendaImportada {
  id: string
  empresa_id: string
  cliente: string
  os_numero: string
  data_venda: string
  valor_total: number
  forma_pagamento?: string
  itens: VendaItemPreview[]
  status: StatusIntegracao
  conta_azul_id: string | null
  erro_mensagem: string | null
  tentativas: number
  importacao_id: string | null
  created_at: string
  updated_at: string
}
