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
  /** E-mail de login vinculado a esta empresa no Conta Azul */
  email_login: string | null
  /** Tipo da empresa: vendas, financeiro (contas a pagar/receber) ou ambos */
  tipo_empresa: 'vendas' | 'financeiro' | 'ambos'
  /** Token de acesso à API do Datacar */
  datacar_token?: string | null
  /** Código da empresa no Datacar */
  datacar_cod_emp?: string | null
  /** ID do operador no Datacar */
  datacar_id_operador?: string | null
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
