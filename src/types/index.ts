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

export interface ContaPagarPreview {
  fornecedor: string
  valor: number
  vencimento: string
  descricao?: string
  /** Número do documento / NF original do Datacar */
  doc?: string
  /** Data de emissão do documento */
  emissao?: string
  linha_original?: string
  valido: boolean
  erros?: string[]
}

export interface ResultadoImportacao {
  total: number
  validos: number
  invalidos: number
  dados: ContaPagarPreview[]
  aviso?: string
}

export interface PayloadContaAzul {
  description: string
  amount: number
  due_date: string
  payment_type: 'BILL'
  competence_date?: string
  observations?: string
  cost_center_id?: string
  service_id?: string
  contact: {
    id?: string
    name: string
  }
}
