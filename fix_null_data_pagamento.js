const { createClient } = require('./node_modules/@supabase/supabase-js')

const SUPABASE_URL = 'https://jyztzfikcccayzwnbrjv.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5enR6ZmlrY2NjYXl6d25icmp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDIxNTI1OSwiZXhwIjoyMDU1NzkxMjU5fQ.L7pvwQO9xM235j7Q-1-y_dF--m--O2L-w3c92w4v3N8'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function fixNullDataPagamento() {
  console.log('--- Checando registros com data_pagamento nula ---')

  const { data: ddasNull, error: err1 } = await supabase
    .from('pagamentos_dda')
    .select('id, data_vencimento, data_pagamento')
    .is('data_pagamento', null)

  if (err1) console.error('Erro ddasNull:', err1)
  console.log(`DDAs com data_pagamento nula: ${ddasNull?.length || 0}`)

  let atualizadosDDA = 0
  for (const item of ddasNull || []) {
    if (item.data_vencimento) {
      await supabase
        .from('pagamentos_dda')
        .update({ data_pagamento: item.data_vencimento })
        .eq('id', item.id)
      atualizadosDDA++
    }
  }
  console.log(`DDAs atualizadas: ${atualizadosDDA}`)

  const { data: agendNull, error: err2 } = await supabase
    .from('agendamentos')
    .select('id, data_vencimento, data_pagamento')
    .is('data_pagamento', null)

  if (err2) console.error('Erro agendNull:', err2)
  console.log(`Agendamentos com data_pagamento nula: ${agendNull?.length || 0}`)

  let atualizadosAgend = 0
  for (const item of agendNull || []) {
    if (item.data_vencimento) {
      await supabase
        .from('agendamentos')
        .update({ data_pagamento: item.data_vencimento })
        .eq('id', item.id)
      atualizadosAgend++
    }
  }
  console.log(`Agendamentos atualizados: ${atualizadosAgend}`)

  console.log('--- Atualização concluída com sucesso! ---')
}

fixNullDataPagamento()
