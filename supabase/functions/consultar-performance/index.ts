import { banco } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function dataValida(valor: string | null) {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null;
}

function intervaloPadrao() {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - 30);
  return { inicio: inicio.toISOString().slice(0, 10), fim: hoje.toISOString().slice(0, 10) };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(request.url);
  const todoPeriodo = ["1", "true", "sim", "todo"].includes((url.searchParams.get("periodo") || url.searchParams.get("todo_periodo") || "").toLowerCase());
  const padrao = intervaloPadrao();
  const inicio = todoPeriodo ? padrao.inicio : (dataValida(url.searchParams.get("inicio")) || padrao.inicio);
  const fim = todoPeriodo ? padrao.fim : (dataValida(url.searchParams.get("fim")) || padrao.fim);
  const idSquad = url.searchParams.get("squad");
  const idPessoa = url.searchParams.get("pessoa");
  try {
    const dados = await banco("rpc/consultar_performance_wrike", {
      method: "POST",
      body: JSON.stringify({
        p_inicio: inicio,
        p_fim: fim,
        p_id_squad: idSquad ? Number(idSquad) : null,
        p_id_pessoa: idPessoa ? Number(idPessoa) : null,
        p_todo_periodo: todoPeriodo,
      }),
    });
    return jsonResponse(dados);
  } catch (error) {
    return jsonResponse({ erro: error instanceof Error ? error.message : "Falha ao consultar indicadores." }, 500);
  }
});
