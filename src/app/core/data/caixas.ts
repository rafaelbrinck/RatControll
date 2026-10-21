import { Injectable, signal } from '@angular/core';
import { inject } from '@angular/core';
import { supabase } from './supabase';
import { AnimaisService } from './animais';

export interface Caixa {
  id: number;
  numero: number;
  status: boolean;
  user_id: string;
  animal_id: number | null;
}

export interface HistoricoCaixa {
  id: number;
  created_at: string;
  data_inicio: string;
  data_fim: string | null;
  status: boolean;
  caixa_id: number;
}

export interface ObservacaoCaixa {
  id: number;
  created_at: string;
  observacao: string;
  historico_id: number;
  tipo_evento: string | null;
  quantidade_filhos: number | null;
  status: boolean | null;
}

export interface CicloVencido {
  historicoId: number;
  caixaId: number;
  numeroCaixa: number;
  dataFim: string;
}

@Injectable({ providedIn: 'root' })
export class CaixasService {
  private readonly animaisService = inject(AnimaisService);

  readonly caixas = signal<Caixa[]>([]);
  readonly ciclosVencidos = signal<CicloVencido[]>([]);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  private usuarioCache: string | null = null;
  private cacheCarregado = false;
  private dataUltimaSincronizacao: string | null = null;
  private requisicao?: { userId: string; promise: Promise<Caixa[]> };

  async listar(userId: string, atualizar = false): Promise<Caixa[]> {
    this.selecionarUsuario(userId);

    if (this.cacheCarregado && !atualizar && this.dataUltimaSincronizacao === this.hoje()) {
      return this.caixas();
    }

    if (this.requisicao?.userId === userId) {
      return this.requisicao.promise;
    }

    this.carregando.set(true);
    this.erro.set(null);

    const promise = this.buscarCaixas(userId).then((caixas) => this.sincronizarStatus(caixas, userId));
    this.requisicao = { userId, promise };

    try {
      const caixas = await promise;
      if (this.usuarioCache === userId) {
        this.caixas.set(caixas);
        this.cacheCarregado = true;
        this.dataUltimaSincronizacao = this.hoje();
      }
      return caixas;
    } catch (error) {
      if (this.usuarioCache === userId) {
        this.erro.set(error instanceof Error ? error.message : 'Não foi possível carregar as caixas.');
      }
      throw error;
    } finally {
      if (this.requisicao?.promise === promise) {
        this.requisicao = undefined;
        this.carregando.set(false);
      }
    }
  }

  limpar(): void {
    this.usuarioCache = null;
    this.cacheCarregado = false;
    this.dataUltimaSincronizacao = null;
    this.requisicao = undefined;
    this.caixas.set([]);
    this.ciclosVencidos.set([]);
    this.carregando.set(false);
    this.erro.set(null);
  }

  private selecionarUsuario(userId: string): void {
    if (this.usuarioCache === userId) {
      return;
    }

    this.usuarioCache = userId;
    this.cacheCarregado = false;
    this.dataUltimaSincronizacao = null;
    this.requisicao = undefined;
    this.caixas.set([]);
    this.ciclosVencidos.set([]);
    this.erro.set(null);
    this.carregando.set(false);
  }

  private async buscarCaixas(userId: string): Promise<Caixa[]> {
    const { data, error } = await supabase
      .from('Caixas')
      .select('id, numero, status, user_id, animal_id')
      .eq('user_id', userId)
      .order('numero', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as Caixa[];
  }

  async criar(numero: number, userId: string, animalId: number): Promise<Caixa> {
    await this.validarAnimalDoUsuario(animalId, userId);
    if (this.caixas().some((caixa) => caixa.numero === numero)) {
      throw new Error(`Já existe uma caixa com o número ${numero}.`);
    }

    const { data, error } = await supabase
      .from('Caixas')
      .insert({ numero, user_id: userId, status: false, animal_id: animalId })
      .select('id, numero, status, user_id, animal_id')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const caixa = data as Caixa;
    this.selecionarUsuario(userId);
    this.caixas.update((caixas) =>
      [...caixas.filter((item) => item.id !== caixa.id), caixa]
        .sort((a, b) => a.numero - b.numero),
    );
    this.cacheCarregado = true;
    this.dataUltimaSincronizacao = this.hoje();
    return caixa;
  }

  async vincularAnimal(caixaId: number, userId: string, animalId: number): Promise<Caixa> {
    await this.validarAnimalDoUsuario(animalId, userId);
    const { data, error } = await supabase
      .from('Caixas')
      .update({ animal_id: animalId })
      .eq('id', caixaId)
      .eq('user_id', userId)
      .select('id, numero, status, user_id, animal_id')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const caixa = data as Caixa;
    this.caixas.update((caixas) => caixas.map((atual) => atual.id === caixa.id ? caixa : atual));
    return caixa;
  }

  private async validarAnimalDoUsuario(animalId: number, userId: string): Promise<void> {
    const animais = await this.animaisService.listar(userId);
    const animal = animais.find((item) => item.id === animalId && item.user_id === userId);
    if (!animal) {
      throw new Error('Selecione um animal cadastrado na sua conta.');
    }
  }

  async buscar(caixaId: number, userId: string): Promise<Caixa | undefined> {
    const caixas = await this.listar(userId);
    return caixas.find((caixa) => caixa.id === caixaId);
  }

  async historicos(caixaId: number, userId: string): Promise<HistoricoCaixa[]> {
    const caixa = await this.buscar(caixaId, userId);
    if (!caixa) {
      throw new Error('Esta caixa não existe ou não está disponível para sua conta.');
    }

    const { data, error } = await supabase
      .from('Historico_Caixas')
      .select('id, created_at, data_inicio, data_fim, status, caixa_id')
      .eq('caixa_id', caixaId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const historicos = (data ?? []) as HistoricoCaixa[];
    const sincronizados = await this.sincronizarHistoricos([caixa], historicos, userId);
    this.atualizarCacheCaixas(sincronizados.caixas);
    return sincronizados.historicos;
  }

  async iniciarCiclo(
    caixaId: number,
    userId: string,
    dataInicio: string,
    dataFim: string,
  ): Promise<HistoricoCaixa> {
    if (!this.dataValida(dataInicio) || !this.dataValida(dataFim)) {
      throw new Error('Informe datas válidas para o ciclo reprodutivo.');
    }
    if (dataFim <= dataInicio) {
      throw new Error('A data de encerramento deve ser posterior à data de início.');
    }

    const historicos = await this.historicos(caixaId, userId);
    if (historicos.some((historico) => this.cicloEstaAtivo(historico))) {
      throw new Error('Esta caixa já possui um ciclo reprodutivo ativo.');
    }

    const { data, error } = await supabase
      .from('Historico_Caixas')
      .insert({
        caixa_id: caixaId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        status: true,
      })
      .select('id, created_at, data_inicio, data_fim, status, caixa_id')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const historico = data as HistoricoCaixa;
    await this.inserirEventosSistema([{
      historicoId: historico.id,
      tipo: 'Início da reprodução',
      observacao: `Ciclo reprodutivo iniciado. Previsão de encerramento: ${dataFim}.`,
    }]);
    await this.atualizarStatusCaixa(caixaId, userId, true);
    return historico;
  }

  async encerrarCiclo(caixaId: number, userId: string): Promise<void> {
    const historicos = await this.historicos(caixaId, userId);
    const cicloAtivo = historicos.find((historico) => this.cicloEstaAtivo(historico));
    if (!cicloAtivo) {
      throw new Error('Esta caixa não possui ciclo reprodutivo ativo.');
    }

    const { error } = await supabase
      .from('Historico_Caixas')
      .update({ status: false })
      .eq('id', cicloAtivo.id)
      .eq('status', true);

    if (error) {
      throw new Error(error.message);
    }

    await this.atualizarStatusCaixa(caixaId, userId, false);
    await this.inserirEventosSistema([{
      historicoId: cicloAtivo.id,
      tipo: 'Finalização da reprodução',
      observacao: 'Ciclo reprodutivo encerrado manualmente.',
    }]);
  }

  private async sincronizarStatus(caixas: Caixa[], userId: string): Promise<Caixa[]> {
    if (!caixas.length) {
      return [];
    }

    const { data, error } = await supabase
      .from('Historico_Caixas')
      .select('id, created_at, data_inicio, data_fim, status, caixa_id')
      .in('caixa_id', caixas.map((caixa) => caixa.id));

    if (error) {
      throw new Error(error.message);
    }

    const sincronizados = await this.sincronizarHistoricos(caixas, (data ?? []) as HistoricoCaixa[], userId);
    return sincronizados.caixas;
  }

  private async sincronizarHistoricos(
    caixas: Caixa[],
    historicos: HistoricoCaixa[],
    userId: string,
  ): Promise<{ caixas: Caixa[]; historicos: HistoricoCaixa[] }> {
    for (const historico of historicos) {
      if (historico.data_fim) {
        continue;
      }

      const dataFim = this.somarMeses(historico.data_inicio, 8);
      const { error } = await supabase
        .from('Historico_Caixas')
        .update({ data_fim: dataFim })
        .eq('id', historico.id);

      if (error) {
        throw new Error(error.message);
      }

      historico.data_fim = dataFim;
    }

    const ativosPorCaixa = new Map<number, number>();
    const caixasPorId = new Map(caixas.map((caixa) => [caixa.id, caixa]));
    const vencidosDesteLote = historicos.flatMap((historico) => {
      const caixa = caixasPorId.get(historico.caixa_id);
      if (!historico.status || !historico.data_fim || historico.data_fim >= this.hoje() || !caixa) {
        return [];
      }

      return [{
        historicoId: historico.id,
        caixaId: caixa.id,
        numeroCaixa: caixa.numero,
        dataFim: historico.data_fim,
      }];
    });

    for (const historico of historicos) {
      if (!this.cicloEstaAtivo(historico)) {
        continue;
      }

      const quantidadeAtiva = (ativosPorCaixa.get(historico.caixa_id) ?? 0) + 1;
      if (quantidadeAtiva > 1) {
        throw new Error(`A caixa ${historico.caixa_id} possui mais de um ciclo ativo. Corrija o histórico antes de continuar.`);
      }
      ativosPorCaixa.set(historico.caixa_id, quantidadeAtiva);
    }

    const atualizadas = caixas.map((caixa) => ({
      ...caixa,
      status: (ativosPorCaixa.get(caixa.id) ?? 0) > 0,
    }));

    const idsSincronizados = new Set(caixas.map((caixa) => caixa.id));
    this.ciclosVencidos.update((atuais) => [
      ...atuais.filter((ciclo) => !idsSincronizados.has(ciclo.caixaId)),
      ...vencidosDesteLote,
    ].sort((a, b) => a.dataFim.localeCompare(b.dataFim)));

    for (const status of [true, false]) {
      const ids = atualizadas
        .filter((caixa) => caixa.status === status && caixas.find((item) => item.id === caixa.id)?.status !== status)
        .map((caixa) => caixa.id);

      if (!ids.length) {
        continue;
      }

      const { error } = await supabase
        .from('Caixas')
        .update({ status })
        .eq('user_id', userId)
        .in('id', ids);

      if (error) {
        throw new Error(error.message);
      }
    }

    return { caixas: atualizadas, historicos };
  }

  private async atualizarStatusCaixa(caixaId: number, userId: string, status: boolean): Promise<void> {
    const { error } = await supabase
      .from('Caixas')
      .update({ status })
      .eq('id', caixaId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    this.caixas.update((caixas) => caixas.map((caixa) =>
      caixa.id === caixaId ? { ...caixa, status } : caixa,
    ));
  }

  private atualizarCacheCaixas(atualizadas: Caixa[]): void {
    const caixasPorId = new Map(atualizadas.map((caixa) => [caixa.id, caixa]));
    this.caixas.update((caixas) => caixas.map((caixa) => caixasPorId.get(caixa.id) ?? caixa));
  }

  private async inserirEventosSistema(
    eventos: Array<{ historicoId: number; tipo: string; observacao: string }>,
  ): Promise<void> {
    if (!eventos.length) {
      return;
    }

    const { error } = await supabase
      .from('Observacoes_Caixas')
      .insert(eventos.map((evento) => ({
        historico_id: evento.historicoId,
        tipo_evento: evento.tipo,
        quantidade_filhos: 0,
        status: null,
        observacao: evento.observacao,
      })));

    if (error) {
      throw new Error(error.message);
    }
  }

  async observacoes(historicoIds: number[]): Promise<ObservacaoCaixa[]> {
    if (!historicoIds.length) {
      return [];
    }

    const { data, error } = await supabase
      .from('Observacoes_Caixas')
      .select('id, created_at, observacao, historico_id, tipo_evento, quantidade_filhos, status')
      .in('historico_id', historicoIds)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as ObservacaoCaixa[];
  }

  async registrarEvento(
    caixaId: number,
    userId: string,
    tipo: string,
    quantidade: number | undefined,
    detalhes: string,
    status: boolean | null,
  ): Promise<void> {
    const historicos = await this.historicos(caixaId, userId);
    const historicoAtivo = historicos.find((historico) => this.cicloEstaAtivo(historico));
    if (!historicoAtivo) {
      throw new Error('Inicie um ciclo reprodutivo antes de registrar eventos nesta caixa.');
    }

    const { error } = await supabase
      .from('Observacoes_Caixas')
      .insert({
        observacao: detalhes.trim(),
        historico_id: historicoAtivo.id,
        tipo_evento: tipo,
        quantidade_filhos: quantidade ?? 0,
        status,
      });

    if (error) {
      throw new Error(error.message);
    }
  }

  private cicloEstaAtivo(historico: HistoricoCaixa): boolean {
    return historico.status;
  }

  private dataValida(data: string): boolean {
    const correspondencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
    if (!correspondencia) {
      return false;
    }

    const [, anoTexto, mesTexto, diaTexto] = correspondencia;
    const ano = Number(anoTexto);
    const mes = Number(mesTexto);
    const dia = Number(diaTexto);
    const valida = new Date(Date.UTC(ano, mes - 1, dia));

    return valida.getUTCFullYear() === ano
      && valida.getUTCMonth() === mes - 1
      && valida.getUTCDate() === dia;
  }

  private hoje(): string {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  somarMeses(data: string, meses: number): string {
    const [ano, mes, dia] = data.split('-').map(Number);
    const mesAlvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
    const ultimoDia = new Date(Date.UTC(mesAlvo.getUTCFullYear(), mesAlvo.getUTCMonth() + 1, 0)).getUTCDate();
    const dataAlvo = new Date(Date.UTC(
      mesAlvo.getUTCFullYear(),
      mesAlvo.getUTCMonth(),
      Math.min(dia, ultimoDia),
    ));
    return dataAlvo.toISOString().slice(0, 10);
  }
}