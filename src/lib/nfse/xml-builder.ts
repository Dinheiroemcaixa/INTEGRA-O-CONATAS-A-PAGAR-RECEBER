import { XMLBuilder } from 'fast-xml-parser'

export interface DadosDPS {
  numeroOS: string
  numeroDPS?: string | number
  serie?: string
  ambiente?: 'homologacao' | 'producao'
  dataCompetencia: string
  valorServico: number
  descricao: string
  cliente: {
    documento: string
    nome: string
    cidade: string // Código IBGE do município (ex: 3106200 para BH)
    cep?: string
    logradouro?: string
    numero?: string
    bairro?: string
  }
  emitente: {
    cnpj: string
    inscricaoMunicipal: string
    regimeTributario: number // Regime de Apuração dos Tributos no Simples Nacional
  }
  codigoTributarioNacional?: string
  codigoComplementarMunicipal?: string
  itemNBS?: string
  aliquotaSimplesNacional?: number
  aliquotaIssqn?: number
}

/**
 * Cria a estrutura oficial do XML da DPS (Declaração de Prestação de Serviços)
 * Padrão Nacional da Receita Federal / Comitê Gestor da NFS-e (schema_dps_v1.00.xsd).
 */
export function buildDPSXml(dados: DadosDPS): string {
  const options = {
    ignoreAttributes: false,
    format: true,
  }
  const builder = new XMLBuilder(options)

  const docOriginal = dados.cliente.documento ? dados.cliente.documento.replace(/\D/g, '') : ''
  const isCNPJ = docOriginal.length > 11

  const cnpjPrestadorLimpo = dados.emitente.cnpj ? dados.emitente.cnpj.replace(/\D/g, '') : '00000000000000'
  const cMunEmit = (dados.cliente.cidade || '3106200').replace(/\D/g, '').padEnd(7, '0').slice(0, 7)
  const serie = String(dados.serie || '900').padStart(5, '0').slice(-5)
  const nDPS = String(dados.numeroDPS || dados.numeroOS || '1').padStart(15, '0').slice(-15)

  // Identificador padrão oficial da DPS conforme a especificação técnica:
  // DPS + cMun (7) + tpInsc (2=CNPJ) + nInsc (14) + serie (5) + nDPS (15) = 43 caracteres
  const dpsId = `DPS${cMunEmit}2${cnpjPrestadorLimpo.padStart(14, '0')}${serie}${nDPS}`

  const dataCompetenciaLimpa = dados.dataCompetencia || new Date().toISOString()
  const dCompetFormatada = dataCompetenciaLimpa.slice(0, 10) // AAAA-MM-DD

  const doc = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    DPS: {
      '@_xmlns': 'http://www.sped.fazenda.gov.br/nfse',
      infDPS: {
        '@_Id': dpsId,
        '@_versao': '1.00',
        tpAmb: dados.ambiente === 'producao' ? 1 : 2, // 1 = Produção, 2 = Homologação
        dhEmi: dataCompetenciaLimpa, // Data/Hora de emissão ISO
        verAplic: 'ConnectaAI_1.0', // Versão do software emissor
        dCompet: dCompetFormatada, // Data de competência da prestação do serviço
        tpEmit: 1, // 1 = Prestador
        serie: String(dados.serie || '900'), // Série da DPS
        nDPS: String(dados.numeroDPS || dados.numeroOS || '1'), // Número da DPS
        prest: {
          CNPJ: cnpjPrestadorLimpo,
          IM: (dados.emitente.inscricaoMunicipal || '').replace(/[^a-zA-Z0-9]/g, ''),
        },
        toma: {
          CNPJ: isCNPJ && docOriginal ? docOriginal : undefined,
          CPF: !isCNPJ && docOriginal ? docOriginal : undefined,
          xNome: dados.cliente.nome || 'Consumidor Final',
          end: dados.cliente.cep ? {
            CEP: dados.cliente.cep.replace(/\D/g, ''),
            xLgr: dados.cliente.logradouro || 'NÃO INFORMADO',
            nro: dados.cliente.numero || 'SN',
            xBairro: dados.cliente.bairro || 'NÃO INFORMADO',
            cMun: cMunEmit, // IBGE
            cPais: '1058', // Brasil
          } : undefined
        },
        serv: {
          locPrest: cMunEmit, // Município onde o serviço foi prestado
          cTribNac: dados.codigoTributarioNacional || '14.01.01',
          cTribMun: dados.codigoComplementarMunicipal || '14.01.01.001',
          cNBS: (dados.itemNBS || '120013110').replace(/\D/g, ''),
          xDesc: dados.descricao || 'Serviços de manutenção veicular',
        },
        valores: {
          vServPrest: {
            vRec: dados.valorServico.toFixed(2),
          },
          trib: {
            tribMun: {
              tribISSQN: 1, // 1 = Operação tributável
              cLocIncid: cMunEmit, // Município de incidência do ISSQN
              pAliq: dados.aliquotaIssqn ? dados.aliquotaIssqn.toFixed(2) : undefined, // Alíquota do ISS (se informado)
              tpRetISSQN: 2, // 2 = Não retido pelo Tomador
            },
            tribFed: {
              piscofins: {
                cst: '00', // 00 - Nenhum
              }
            },
            totTrib: {
              pAliqSN: dados.aliquotaSimplesNacional ? dados.aliquotaSimplesNacional.toFixed(2) : '11.34'
            }
          }
        }
      }
    }
  }

  // Remove campos vazios ou undefined para garantir conformidade estrita com o XSD
  const cleanObj = (obj: any) => {
    Object.keys(obj).forEach(key => {
      if (obj[key] && typeof obj[key] === 'object') {
        cleanObj(obj[key])
        if (Object.keys(obj[key]).length === 0) delete obj[key]
      }
      else if (obj[key] === undefined || obj[key] === null || obj[key] === '') {
        delete obj[key]
      }
    })
  }
  cleanObj(doc)

  return builder.build(doc)
}
