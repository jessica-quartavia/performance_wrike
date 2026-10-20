import { banco } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function dataValida(valor: string | null) {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null;
}

function segundaAtualLocal() {
  const hoje = new Date();
  const dia = hoje.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() + diff);
  return seg.toISOString().slice(0, 10);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(request.url);
  const segunda = dataValida(url.searchParams.get("segunda")) || segundaAtualLocal();
  const idSquad = url.searchParams.get("squad");
  const idPessoa = url.searchParams.get("pessoa");
  const apenasPendentes = ["1", "true", "sim"].includes((url.searchParams.get("apenas_pendentes") || "").toLowerCase());
  const busca = url.searchParams.get("busca")?.trim() || null;
  try {
    const dados = await banco("rpc/consultar_agenda_entregas_wrike", {
      method: "POST",
      body: JSON.stringify({
        p_segunda: segunda,
        p_id_squad: idSquad ? Number(idSquad) : null,
        p_id_pessoa: idPessoa ? Number(idPessoa) : null,
        p_apenas_pendentes: apenasPendentes,
        p_busca: busca,
      }),
    });
    return jsonResponse(dados);
  } catch (error) {
    return jsonResponse({ erro: error instanceof Error ? error.message : "Falha ao consultar agenda." }, 500);
  }
});
