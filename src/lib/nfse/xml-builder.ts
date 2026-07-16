import { XMLBuilder } from 'fast-xml-parser'

export interface DadosDPS {
  numeroOS: string
  dataCompetencia: string
  valorServico: number
  descricao: string
  cliente: {
    documento: string
    nome: string
    cidade: string
  }
  emitente: {
    cnpj: string
    inscricaoMunicipal: string
    regimeTributario: number
  }
  // No padrão nacional, precisamos do código tributário nacional
  codigoTributarioNacional?: string
}

/**
 * Cria a estrutura base do XML do DPS Padrão Nacional.
 * Esta versão é um mockup simplificado para a fase de testes.
 */
export function buildDPSXml(dados: DadosDPS): string {
  const options = {
    ignoreAttributes: false,
    format: true,
  }
  const builder = new XMLBuilder(options)

  const doc = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    DPS: {
      '@_xmlns': 'http://www.sped.fazenda.gov.br/nfse',
      infDPS: {
        '@_Id': `DPS${dados.numeroOS}`,
        '@_versao': '1.00',
        tpAmb: 2, // 1 = Produção, 2 = Homologação
        dhEmi: new Date().toISOString(),
        prest: {
          CNPJ: dados.emitente.cnpj,
          IM: dados.emitente.inscricaoMunicipal,
        },
        toma: {
          CNPJ: dados.cliente.documento.length > 11 ? dados.cliente.documento : undefined,
          CPF: dados.cliente.documento.length <= 11 ? dados.cliente.documento : undefined,
          xNome: dados.cliente.nome,
        },
        serv: {
          locPrest: dados.cliente.cidade, // Código IBGE geralmente
          cTribNac: dados.codigoTributarioNacional || '14.01',
          xDesc: dados.descricao,
        },
        valores: {
          vServPrest: {
            vRec: dados.valorServico.toFixed(2),
          },
          trib: {
            tribMun: {
              tribISSQN: 1, // Exigível
              cLocIncid: dados.cliente.cidade,
            }
          }
        }
      }
    }
  }

  return builder.build(doc)
}
